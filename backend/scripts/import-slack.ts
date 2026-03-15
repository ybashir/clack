/**
 * Import Slack export (public channels) into Clack.
 *
 * Usage:
 *   npx tsx scripts/import-slack.ts /path/to/slack-export.zip
 *
 * Requires DATABASE_URL in env (or .env file).
 * Run from the backend/ directory.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import * as fs from 'fs';
import AdmZip from 'adm-zip';

const prisma = new PrismaClient();

const userMap = new Map<string, number>();
const channelMap = new Map<string, number>();
const messageMap = new Map<string, number>();

interface SlackUser {
  id: string; name: string; real_name?: string;
  profile: { email?: string; real_name?: string; display_name?: string; image_72?: string; image_192?: string };
  deleted?: boolean; is_bot?: boolean;
}
interface SlackChannel {
  id: string; name: string; is_archived?: boolean; created: number;
  members?: string[]; pins?: { id: string; created: number }[];
}
interface SlackMessage {
  type: string; subtype?: string; user?: string; text: string; ts: string;
  thread_ts?: string; edited?: { user: string; ts: string };
  reactions?: { name: string; users: string[] }[];
}

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

async function main() {
  const zipPath = process.argv[2];
  if (!zipPath || !fs.existsSync(zipPath)) {
    console.error('Usage: npx tsx scripts/import-slack.ts /path/to/slack-export.zip');
    process.exit(1);
  }

  console.log(`Opening Slack export: ${zipPath}`);
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  function readJson<T>(filename: string): T | null {
    const entry = entries.find(e => e.entryName === filename);
    if (!entry) return null;
    return JSON.parse(entry.getData().toString('utf8'));
  }

  // 1. Batch import users
  console.log('\n=== Importing Users ===');
  const slackUsers = readJson<SlackUser[]>('users.json')!;
  if (!slackUsers) { console.error('No users.json'); process.exit(1); }

  const nonBotUsers = slackUsers.filter(u => !u.is_bot);
  console.log(`  ${nonBotUsers.length} non-bot users to import (${slackUsers.length - nonBotUsers.length} bots skipped)`);

  // Batch insert users with raw SQL for speed
  for (let i = 0; i < nonBotUsers.length; i += 100) {
    const batch = nonBotUsers.slice(i, i + 100);
    const values = batch.map(su => {
      const email = su.profile.email || `${su.name}@slack-import.local`;
      const name = su.profile.real_name || su.real_name || su.profile.display_name || su.name;
      const avatar = su.profile.image_192 || su.profile.image_72 || '';
      return `('${esc(email)}', '${esc(name)}', '${esc(avatar)}', 'MEMBER', 'offline', NOW(), NOW())`;
    }).join(',');

    const result = await prisma.$queryRawUnsafe<{id: number; email: string}[]>(
      `INSERT INTO "User" ("email", "name", "avatar", "role", "status", "createdAt", "updatedAt")
       VALUES ${values}
       ON CONFLICT ("email") DO UPDATE SET "email" = "User"."email"
       RETURNING id, email`
    );

    // Map slack IDs by email
    const emailToClackId = new Map(result.map(r => [r.email, r.id]));
    for (const su of batch) {
      const email = su.profile.email || `${su.name}@slack-import.local`;
      const clackId = emailToClackId.get(email);
      if (clackId) userMap.set(su.id, clackId);
    }

    console.log(`  Imported ${Math.min(i + 100, nonBotUsers.length)}/${nonBotUsers.length} users`);
  }

  // 2. Import channels + batch members with raw SQL
  console.log('\n=== Importing Channels ===');
  const slackChannels = readJson<SlackChannel[]>('channels.json')!;
  if (!slackChannels) { console.error('No channels.json'); process.exit(1); }

  for (const sc of slackChannels) {
    // Truncate channel name to 80 chars (Clack limit)
    const channelName = sc.name.slice(0, 80);
    const existing = await prisma.channel.findUnique({ where: { name: channelName } });
    if (existing) {
      channelMap.set(sc.id, existing.id);
    } else {
      const channel = await prisma.channel.create({
        data: { name: channelName, isPrivate: false, createdAt: new Date(sc.created * 1000), archivedAt: sc.is_archived ? new Date() : null },
      });
      channelMap.set(sc.id, channel.id);
    }
    const clackChannelId = channelMap.get(sc.id)!;
    console.log(`  #${channelName} -> ID ${clackChannelId}`);

    // Batch insert members using raw SQL (much faster than individual upserts)
    if (sc.members && sc.members.length > 0) {
      const validMembers = sc.members
        .map(m => userMap.get(m))
        .filter((id): id is number => id !== undefined);

      // Insert in batches of 500
      for (let i = 0; i < validMembers.length; i += 500) {
        const batch = validMembers.slice(i, i + 500);
        const values = batch.map(uid => `(${uid}, ${clackChannelId}, 'MEMBER', NOW())`).join(',');
        await prisma.$executeRawUnsafe(
          `INSERT INTO "ChannelMember" ("userId", "channelId", "role", "joinedAt") VALUES ${values} ON CONFLICT DO NOTHING`
        );
      }
      console.log(`    Added ${validMembers.length} members`);
    }
  }

  // 3. Import messages
  console.log('\n=== Importing Messages ===');
  const allMessages: { channelId: string; msg: SlackMessage }[] = [];

  for (const sc of slackChannels) {
    const channelDir = `${sc.name}/`;
    const dayFiles = entries.filter(e => e.entryName.startsWith(channelDir) && e.entryName.endsWith('.json'));
    for (const dayFile of dayFiles) {
      const messages: SlackMessage[] = JSON.parse(dayFile.getData().toString('utf8'));
      for (const msg of messages) {
        allMessages.push({ channelId: sc.id, msg });
      }
    }
  }

  allMessages.sort((a, b) => parseFloat(a.msg.ts) - parseFloat(b.msg.ts));
  console.log(`  Found ${allMessages.length} total messages`);

  // Pass 1: Top-level messages in batches
  let imported = 0;
  let skipped = 0;
  const topLevelBatch: { channelId: string; msg: SlackMessage }[] = [];

  for (const item of allMessages) {
    const { msg } = item;
    if (msg.type !== 'message') { skipped++; continue; }
    if (msg.subtype && !['file_share', 'thread_broadcast'].includes(msg.subtype)) { skipped++; continue; }
    if (!msg.user || !userMap.get(msg.user) || !channelMap.get(item.channelId)) { skipped++; continue; }
    const isReply = msg.thread_ts && msg.thread_ts !== msg.ts;
    if (isReply) continue;
    topLevelBatch.push(item);
  }

  // Batch insert top-level messages using raw SQL
  for (let i = 0; i < topLevelBatch.length; i += 200) {
    const batch = topLevelBatch.slice(i, i + 200);
    const values = batch.map(({ channelId, msg }) => {
      const clackChannelId = channelMap.get(channelId)!;
      const clackUserId = userMap.get(msg.user!)!;
      const createdAt = new Date(parseFloat(msg.ts) * 1000).toISOString();
      const content = esc(convertSlackMarkup(msg.text));
      const editedAt = msg.edited ? `'${new Date(parseFloat(msg.edited.ts) * 1000).toISOString()}'` : 'NULL';
      return `('${esc(content)}', ${clackUserId}, ${clackChannelId}, NULL, '${createdAt}', '${createdAt}', ${editedAt})`;
    }).join(',');

    const result = await prisma.$queryRawUnsafe<{id: number}[]>(
      `INSERT INTO "Message" ("content", "userId", "channelId", "threadId", "createdAt", "updatedAt", "editedAt") VALUES ${values} RETURNING id`
    );

    // Map message IDs back
    for (let j = 0; j < result.length; j++) {
      const { channelId, msg } = batch[j];
      messageMap.set(`${channelId}:${msg.ts}`, result[j].id);
    }

    imported += batch.length;
    if (imported % 1000 === 0 || i + 200 >= topLevelBatch.length) {
      console.log(`  Pass 1: ${imported}/${topLevelBatch.length} top-level messages`);
    }
  }

  console.log(`  Pass 1 done: ${imported} messages, ${skipped} skipped`);

  // Pass 2: Thread replies
  let threadReplies = 0;
  const replyBatch: { channelId: string; msg: SlackMessage }[] = [];

  for (const item of allMessages) {
    const { msg } = item;
    if (msg.type !== 'message') continue;
    if (msg.subtype && !['file_share', 'thread_broadcast'].includes(msg.subtype)) continue;
    if (!msg.user || !userMap.get(msg.user) || !channelMap.get(item.channelId)) continue;
    const isReply = msg.thread_ts && msg.thread_ts !== msg.ts;
    if (!isReply) continue;
    replyBatch.push(item);
  }

  for (let i = 0; i < replyBatch.length; i += 200) {
    const batch = replyBatch.slice(i, i + 200);
    const values = batch.map(({ channelId, msg }) => {
      const clackChannelId = channelMap.get(channelId)!;
      const clackUserId = userMap.get(msg.user!)!;
      const parentId = messageMap.get(`${channelId}:${msg.thread_ts}`) || null;
      const createdAt = new Date(parseFloat(msg.ts) * 1000).toISOString();
      const content = esc(convertSlackMarkup(msg.text));
      const editedAt = msg.edited ? `'${new Date(parseFloat(msg.edited.ts) * 1000).toISOString()}'` : 'NULL';
      return `('${esc(content)}', ${clackUserId}, ${clackChannelId}, ${parentId || 'NULL'}, '${createdAt}', '${createdAt}', ${editedAt})`;
    }).join(',');

    const result = await prisma.$queryRawUnsafe<{id: number}[]>(
      `INSERT INTO "Message" ("content", "userId", "channelId", "threadId", "createdAt", "updatedAt", "editedAt") VALUES ${values} RETURNING id`
    );

    for (let j = 0; j < result.length; j++) {
      const { channelId, msg } = batch[j];
      messageMap.set(`${channelId}:${msg.ts}`, result[j].id);
    }

    threadReplies += batch.length;
    if (threadReplies % 1000 === 0 || i + 200 >= replyBatch.length) {
      console.log(`  Pass 2: ${threadReplies}/${replyBatch.length} thread replies`);
    }
  }

  console.log(`  Pass 2 done: ${threadReplies} thread replies`);

  // 4. Batch import reactions
  console.log('\n=== Importing Reactions ===');
  let reactionCount = 0;
  const reactionValues: string[] = [];

  for (const { channelId, msg } of allMessages) {
    if (!msg.reactions) continue;
    const clackMessageId = messageMap.get(`${channelId}:${msg.ts}`);
    if (!clackMessageId) continue;

    for (const reaction of msg.reactions) {
      const emoji = `:${reaction.name}:`;
      for (const slackUserId of reaction.users) {
        const clackUserId = userMap.get(slackUserId);
        if (!clackUserId) continue;
        reactionValues.push(`('${esc(emoji)}', ${clackUserId}, ${clackMessageId}, NOW())`);
      }
    }
  }

  // Insert reactions in batches
  for (let i = 0; i < reactionValues.length; i += 500) {
    const batch = reactionValues.slice(i, i + 500);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Reaction" ("emoji", "userId", "messageId", "createdAt") VALUES ${batch.join(',')} ON CONFLICT DO NOTHING`
    );
    reactionCount += batch.length;
  }
  console.log(`  Imported ${reactionCount} reactions`);

  // 5. Pins
  console.log('\n=== Importing Pins ===');
  let pinCount = 0;
  for (const sc of slackChannels) {
    if (!sc.pins) continue;
    for (const pin of sc.pins) {
      const clackMessageId = messageMap.get(`${sc.id}:${pin.id}`);
      if (!clackMessageId) continue;
      await prisma.message.update({
        where: { id: clackMessageId },
        data: { isPinned: true, pinnedAt: new Date(pin.created * 1000) },
      });
      pinCount++;
    }
  }
  console.log(`  Pinned ${pinCount} messages`);

  console.log('\n=== Import Complete ===');
  console.log(`  Users:    ${userMap.size}`);
  console.log(`  Channels: ${channelMap.size}`);
  console.log(`  Messages: ${imported + threadReplies}`);
  console.log(`  Reactions: ${reactionCount}`);
  console.log(`  Pins:     ${pinCount}`);

  await prisma.$disconnect();
}

function convertSlackMarkup(text: string): string {
  return text
    .replace(/<@(U[A-Z0-9]+)>/g, (_, userId) => {
      const clackId = userMap.get(userId);
      return clackId ? `<@${clackId}>` : '@unknown';
    })
    .replace(/<#C[A-Z0-9]+\|([^>]+)>/g, '#$1')
    .replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, '[$2]($1)')
    .replace(/<(https?:\/\/[^>]+)>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
