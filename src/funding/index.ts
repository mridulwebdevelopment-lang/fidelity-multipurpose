import type { ChatInputCommandInteraction, Client, Message, TextChannel } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { prisma, fundingUpdatesHistory } from '../db/index.js';
import { getEnv, getStaffUserIds } from '../env.js';
import { extractNeededValuesFromWords } from './parseNeeded.js';
import { poundsToPence, formatPence } from './money.js';
import { recognizeImage } from './ocr.js';
import { daysBetweenIsoInclusive, getUkShiftInfo, daysUntilEndOfWeek, getEndOfWeekIso } from './ukTime.js';

type FundingRecalcOptions = {
  endDate?: string | null;
  daysLeftOverride?: number | null;
  addAmount?: number | null;
  removeAmount?: number | null;
  resetAdjustment?: boolean | null;
};

function isStaffUser(userId: string): boolean {
  const env = getEnv();
  const staffIds = new Set(getStaffUserIds(env));
  return staffIds.has(userId);
}

function isImageAttachment(att: { contentType?: string | null; name?: string | null; url?: string }): boolean {
  if (!att.url) return false;
  if (att.contentType?.startsWith('image/')) return true;
  const name = att.name ?? '';
  return /\.(png|jpe?g|gif|webp)$/i.test(name);
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download image (HTTP ${res.status})`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function findLatestImageMessage(channel: TextChannel, limit = 50): Promise<{ messageId: string; imageUrl: string } | null> {
  const messages = await channel.messages.fetch({ limit });
  for (const msg of messages.values()) {
    const image = msg.attachments.find((a) => isImageAttachment(a));
    if (image?.url) return { messageId: msg.id, imageUrl: image.url };
  }
  return null;
}

function isValidIsoDate(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso);
}

function truncateUtf8(input: string, maxBytes: number): string {
  // Discord embed field value limit is 1024; depending on server internals it can behave like a byte limit.
  // Enforce by UTF-8 bytes to be safe with punctuation/emoji.
  if (!input) return input;
  if (Buffer.byteLength(input, 'utf8') <= maxBytes) return input;
  let out = input;
  const ellipsis = '…';
  // Trim until it fits with an ellipsis suffix.
  while (out.length > 0 && Buffer.byteLength(out + ellipsis, 'utf8') > maxBytes) {
    out = out.slice(0, -1);
  }
  return out.length > 0 ? out + ellipsis : ellipsis;
}

function sanitizeEmbedText(input: string, maxBytes = 1000): string {
  return truncateUtf8(input ?? '', maxBytes);
}

function sanitizeEmbedFields(fields: { name: string; value: string; inline?: boolean }[], maxBytes = 1000) {
  for (const f of fields) {
    // names have their own limits but ours are already short; still sanitize values hard.
    if (typeof f.value === 'string') f.value = sanitizeEmbedText(f.value, maxBytes);
  }
}

function renderRowsForEmbed(
  rows: { name: string; neededPence: number | null; confidence: number }[],
  currencySymbol: string,
  maxLines = 999, // Show all rows by default (Discord embed limit is 1024 chars per field)
): { text: string; flaggedCount: number } {
  // Sort: rows with values first (by value desc), then rows without values
  const sorted = [...rows].sort((a, b) => {
    if (a.neededPence === null && b.neededPence === null) return 0;
    if (a.neededPence === null) return 1;
    if (b.neededPence === null) return -1;
    return b.neededPence - a.neededPence;
  });
  let flaggedCount = 0;

  const lines: string[] = [];
  // Discord's field value limit is 1024; enforce by bytes to avoid unicode surprises.
  const MAX_FIELD_BYTES = 900; // leave buffer for truncation marker
  let currentBytes = 0;
  
  for (const r of sorted) {
    const lowConf = r.confidence < 60;
    if (lowConf) flaggedCount++;
    const flag = lowConf ? '⚠️' : '';
    // Make names even shorter (12 chars max)
    const name = r.name.length > 12 ? r.name.slice(0, 11) + '…' : r.name;
    const valueStr = r.neededPence === null ? '—' : formatPence(r.neededPence, currencySymbol);
    // Ultra compact format: flag name value (no confidence shown to save space)
    const line = `${flag} **${name}** ${valueStr}`;
    
    // Check if adding this line would exceed the limit
    const lineWithNewline = line + '\n';
    const lineBytes = Buffer.byteLength(lineWithNewline, 'utf8');
    if (currentBytes + lineBytes > MAX_FIELD_BYTES && lines.length > 0) {
      const remaining = Math.max(0, sorted.length - lines.length);
      const truncMsg = remaining > 0 ? `\n…${remaining} more` : `\n…`;
      const truncBytes = Buffer.byteLength(truncMsg, 'utf8');
      if (currentBytes + truncBytes <= 1000) lines.push(truncMsg);
      break;
    }
    
    lines.push(line);
    currentBytes += lineBytes;
  }
  
  const result = lines.join('\n');
  // Hard limit: never exceed 1000 bytes (well under 1024)
  return { text: sanitizeEmbedText(result, 1000), flaggedCount };
}

export async function handleFundingChannelMessage(message: Message) {
  const env = getEnv();
  if (!env.FUNDING_CHANNEL_ID) return; // feature disabled
  if (!message.guild || !message.channel.isTextBased()) return;
  if (message.author.bot) return;
  if (message.channel.id !== env.FUNDING_CHANNEL_ID) return;
  if (!('send' in message.channel)) return;
  const sendableChannel = message.channel as unknown as { send: (...args: any[]) => Promise<any> };
  const currencySymbol = '$'; // Always dollar

  const image = message.attachments.find((a) => isImageAttachment(a));
  if (!image?.url) return;

  // Lightweight UX: acknowledge quickly, then process.
  const ack = await sendableChannel.send({ content: '🧠 Processing table image (OCR)…' });
  try {
    const buffer = await fetchBuffer(image.url);
    const ocr = await recognizeImage(buffer);
    const parsed = extractNeededValuesFromWords(ocr.words);
    const preview = renderRowsForEmbed(parsed.rows, currencySymbol);

    await prisma.fundingState.upsert({
      where: { guildId: message.guild.id },
      create: {
        guildId: message.guild.id,
        channelId: env.FUNDING_CHANNEL_ID,
        endDate: env.FUNDING_END_DATE && isValidIsoDate(env.FUNDING_END_DATE) ? env.FUNDING_END_DATE : null,
        manualAdjustmentPence: 0,
        lastImageMessageId: message.id,
        lastImageUrl: image.url,
        lastOcrText: ocr.text,
        lastParsedNeededValues: parsed.neededPenceValues,
        lastParsedTotalPence: parsed.totalPence,
      },
      update: {
        channelId: env.FUNDING_CHANNEL_ID,
        lastImageMessageId: message.id,
        lastImageUrl: image.url,
        lastOcrText: ocr.text,
        lastParsedNeededValues: parsed.neededPenceValues,
        lastParsedTotalPence: parsed.totalPence,
      },
    });

    await ack.edit({ content: '✅ Image processed. Sending summary…' }).catch(() => {});
    
    // Final safety check: ensure preview text is under 1000 characters (hard limit)
    const previewText = sanitizeEmbedText(preview.text || 'No rows detected under the "Needed" column.', 1000);
    
    await sendableChannel.send({
      embeds: [
        {
          title: 'Funding table parsed',
          description: previewText,
          color: 0x22c55e,
          fields: [
            { name: 'Rows found', value: `**${parsed.rows.length}**`, inline: true },
            { name: 'Total remaining', value: `**${formatPence(parsed.totalPence, currencySymbol)}**`, inline: true },
            ...(preview.flaggedCount > 0
              ? [{ name: 'Flagged (low confidence)', value: `**${preview.flaggedCount}**`, inline: true }]
              : []),
          ],
          footer: {
            text:
              preview.flaggedCount > 0
                ? '⚠️ Some rows had low OCR confidence. Consider re-uploading a clearer screenshot.'
                : 'Tip: crop tightly around the table for best OCR.',
          },
          timestamp: new Date().toISOString(),
        },
      ],
    });
  } catch (err: any) {
    console.error('Failed to process funding channel image:', err);
    await ack.edit({ content: '❌ Failed to process the image. Please try re-uploading a clearer screenshot (crop tightly to the table).' }).catch(() => {});
  }
}

