import { PrismaClient } from '@prisma/client';
import data from '@emoji-mart/data';

const prisma = new PrismaClient();

async function main() {
  // Build shortcode -> native map from emoji-mart
  const emojiMap: Record<string, string> = {};
  for (const [id, emoji] of Object.entries((data as any).emojis)) {
    const native = (emoji as any)?.skins?.[0]?.native;
    if (native) emojiMap[id] = native;
  }

  // Common Slack aliases
  Object.assign(emojiMap, {
    '+1': '👍', '-1': '👎', 'thumbsup': '👍', 'thumbsdown': '👎',
    'clapping': '👏', 'plus1': '👍', 'clap': '👏', 'pray': '🙏',
    'fire': '🔥', '100': '💯', 'tada': '🎉', 'rocket': '🚀',
    'eyes': '👀', 'wave': '👋', 'muscle': '💪', 'white_check_mark': '✅',
    'heavy_check_mark': '✔️', 'x': '❌', 'warning': '⚠️',
    'rolling_on_the_floor_laughing': '🤣', 'slightly_smiling_face': '🙂',
    'raised_hands': '🙌', 'thinking_face': '🤔', 'face_with_rolling_eyes': '🙄',
    'clap-clap': '👏', 'star-struck': '🤩', 'saluting_face': '🫡',
    'smiling_face_with_tear': '🥲', 'face_holding_back_tears': '🥹',
  });

  const reactions = await prisma.$queryRawUnsafe<{emoji: string}[]>(
    'SELECT DISTINCT emoji FROM "Reaction"'
  );

  console.log(`Found ${reactions.length} unique emoji to convert`);
  let converted = 0, removed = 0;

  for (const { emoji } of reactions) {
    // Strip colons and skin tone suffix
    const clean = emoji.replace(/^:|:$/g, '').replace(/::skin-tone-\d+$/, '');
    const native = emojiMap[clean];

    if (native) {
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "Reaction" SET emoji = $1 WHERE emoji = $2`, native, emoji
        );
        converted++;
        console.log(`  ✓ ${emoji} -> ${native}`);
      } catch {
        // Duplicate unique constraint - delete these
        await prisma.$executeRawUnsafe(`DELETE FROM "Reaction" WHERE emoji = $1`, emoji);
        removed++;
        console.log(`  ✗ ${emoji} -> ${native} (duplicate, removed)`);
      }
    } else {
      // Custom Slack emoji with no Unicode equivalent
      await prisma.$executeRawUnsafe(`DELETE FROM "Reaction" WHERE emoji = $1`, emoji);
      removed++;
      console.log(`  ✗ ${emoji} (custom, removed)`);
    }
  }

  console.log(`\nDone: ${converted} converted, ${removed} removed`);
  const remaining = await prisma.$queryRawUnsafe<{count: bigint}[]>('SELECT count(*) FROM "Reaction"');
  console.log(`Reactions remaining: ${remaining[0].count}`);
  await prisma.$disconnect();
}

main().catch(console.error);
