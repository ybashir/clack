/**
 * Import files/images from Slack into Clack.
 * Downloads files using Slack API token, uploads to GCS, links to messages.
 *
 * Usage:
 *   npx tsx scripts/import-slack-files.ts /path/to/slack-export.zip
 *
 * Requires env vars:
 *   DATABASE_URL, SLACK_TOKEN, GCS_BUCKET_NAME
 */

import { PrismaClient } from '@prisma/client';
import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import AdmZip from 'adm-zip';

const prisma = new PrismaClient();
const storage = new Storage();
const BUCKET = process.env.GCS_BUCKET_NAME || 'clack-uploads-clack-chat';
const SLACK_TOKEN = process.env.SLACK_TOKEN;

if (!SLACK_TOKEN) {
  console.error('Set SLACK_TOKEN env var');
  process.exit(1);
}

interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  size: number;
  url_private: string;
  url_private_download?: string;
  filetype?: string;
  mode?: string;
}

interface SlackMessage {
  type: string;
  subtype?: string;
  user?: string;
  text: string;
  ts: string;
  thread_ts?: string;
  files?: SlackFile[];
}

interface SlackChannel {
  id: string;
  name: string;
}

async function downloadSlackFile(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${SLACK_TOKEN}` },
    });
    if (!res.ok) {
      console.log(`    Failed to download: ${res.status} ${res.statusText}`);
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (err: any) {
    console.log(`    Download error: ${err.message}`);
    return null;
  }
}

async function uploadToGCS(buffer: Buffer, filename: string, mimetype: string): Promise<string> {
  const bucket = storage.bucket(BUCKET);
  const gcsPath = `uploads/${filename}`;
  const file = bucket.file(gcsPath);

  await file.save(buffer, {
    metadata: { contentType: mimetype },
    resumable: false,
  });

  return gcsPath;
}

async function main() {
  const zipPath = process.argv[2];
  if (!zipPath || !fs.existsSync(zipPath)) {
    console.error('Usage: npx tsx scripts/import-slack-files.ts /path/to/slack-export.zip');
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

  // Build user map: slack ID -> clack ID (by email)
  const slackUsers = readJson<any[]>('users.json')!;
  const userMap = new Map<string, number>();

  for (const su of slackUsers) {
    if (su.is_bot) continue;
    const email = su.profile?.email || `${su.name}@slack-import.local`;
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) userMap.set(su.id, user.id);
  }
  console.log(`Mapped ${userMap.size} users`);

  // Build message map: "ts" -> clack message ID
  // We match by createdAt timestamp since that's how we imported
  const slackChannels = readJson<SlackChannel[]>('channels.json')!;
  const channelNameToId = new Map<string, number>();
  for (const sc of slackChannels) {
    const ch = await prisma.channel.findUnique({ where: { name: sc.name.slice(0, 80) } });
    if (ch) channelNameToId.set(sc.name, ch.id);
  }

  // Collect all messages with files
  let totalFiles = 0;
  let downloaded = 0;
  let failed = 0;
  let skipped = 0;

  for (const sc of slackChannels) {
    const clackChannelId = channelNameToId.get(sc.name);
    if (!clackChannelId) continue;

    const channelDir = `${sc.name}/`;
    const dayFiles = entries.filter(e =>
      e.entryName.startsWith(channelDir) && e.entryName.endsWith('.json')
    );

    for (const dayFile of dayFiles) {
      const messages: SlackMessage[] = JSON.parse(dayFile.getData().toString('utf8'));

      for (const msg of messages) {
        if (!msg.files || msg.files.length === 0) continue;
        if (!msg.user) continue;

        const clackUserId = userMap.get(msg.user);
        if (!clackUserId) continue;

        // Find the corresponding Clack message by timestamp
        const createdAt = new Date(parseFloat(msg.ts) * 1000);
        const clackMessage = await prisma.message.findFirst({
          where: {
            channelId: clackChannelId,
            userId: clackUserId,
            createdAt: {
              gte: new Date(createdAt.getTime() - 1000),
              lte: new Date(createdAt.getTime() + 1000),
            },
          },
        });

        if (!clackMessage) continue;

        for (const file of msg.files) {
          totalFiles++;
          const url = file.url_private_download || file.url_private;
          if (!url) { skipped++; continue; }

          // Skip tombstoned/deleted files
          if (file.mode === 'tombstone') { skipped++; continue; }

          const originalName = file.name || `file-${file.id}`;
          const mimetype = file.mimetype || 'application/octet-stream';
          const ext = path.extname(originalName) || '';
          const uniqueName = `${crypto.randomUUID()}${ext}`;

          console.log(`  [${downloaded + failed + 1}/${totalFiles}] #${sc.name}: ${originalName} (${(file.size / 1024).toFixed(1)}KB)`);

          const buffer = await downloadSlackFile(url);
          if (!buffer) { failed++; continue; }

          try {
            const gcsPath = await uploadToGCS(buffer, uniqueName, mimetype);

            await prisma.file.create({
              data: {
                filename: uniqueName,
                originalName,
                mimetype,
                size: file.size || buffer.length,
                url: `/files/placeholder`, // Will be served via download endpoint
                gcsPath,
                userId: clackUserId,
                messageId: clackMessage.id,
              },
            });

            downloaded++;
          } catch (err: any) {
            console.log(`    Upload error: ${err.message}`);
            failed++;
          }
        }
      }
    }
  }

  console.log(`\n=== File Import Complete ===`);
  console.log(`  Total files found: ${totalFiles}`);
  console.log(`  Downloaded & uploaded: ${downloaded}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Skipped: ${skipped}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
