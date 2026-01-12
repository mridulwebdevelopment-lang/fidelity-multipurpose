import type { ChatInputCommandInteraction, Client, Message, TextChannel } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { prisma } from '../db/index.js';
import { getEnv, getStaffUserIds } from '../env.js';
import { extractNeededValuesFromWords } from './parseNeeded.js';
import { poundsToPence, formatPence } from './money.js';
import { recognizeImage } from './ocr.js';
import { daysBetweenIsoInclusive, getUkShiftInfo } from './ukTime.js';

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

function renderRowsForEmbed(
  rows: { name: string; neededPence: number | null; confidence: number }[],
  currencySymbol: string,
  maxLines = 20,
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
  for (const r of sorted.slice(0, maxLines)) {
    const lowConf = r.confidence < 60;
    if (lowConf) flaggedCount++;
    const flag = lowConf ? '⚠️ ' : '';
    const name = r.name.length > 28 ? r.name.slice(0, 27) + '…' : r.name;
    const valueStr = r.neededPence === null ? '**—**' : formatPence(r.neededPence, currencySymbol);
    lines.push(`${flag}**${name}** — ${valueStr}${r.neededPence !== null ? ` (conf ${r.confidence}%)` : ''}`);
  }
  const remaining = sorted.length - Math.min(sorted.length, maxLines);
  if (remaining > 0) lines.push(`…and **${remaining}** more`);
  return { text: lines.join('\n'), flaggedCount };
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
    const preview = renderRowsForEmbed(parsed.rows, currencySymbol, 15);

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
    await sendableChannel.send({
      embeds: [
        {
          title: 'Funding table parsed',
          description: preview.text || 'No rows detected under the “Needed” column.',
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
    await ack.edit({ content: `❌ Failed to process image: ${err?.message || String(err)}` }).catch(() => {});
  }
}

export async function handleUpdateFundingCommand(client: Client, interaction: ChatInputCommandInteraction) {
  const env = getEnv();
  if (interaction.commandName !== 'update') return;
  const currencySymbol = '$'; // Always dollar

  if (!interaction.guild) {
    await interaction.reply({ content: '❌ This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (!isStaffUser(interaction.user.id)) {
    await interaction.reply({ content: '❌ Only staff can use this command.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (!env.FUNDING_CHANNEL_ID) {
    await interaction.reply({
      content: '❌ Funding tracker is not configured. Set `FUNDING_CHANNEL_ID` in the bot env.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channel = await client.channels.fetch(env.FUNDING_CHANNEL_ID);
  if (!channel || !channel.isTextBased()) {
    await interaction.reply({
      content: '❌ Funding channel not found / not text-based. Check `FUNDING_CHANNEL_ID`.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const textChannel = channel as TextChannel;

  const options: FundingRecalcOptions = {
    endDate: interaction.options.getString('end_date'),
    daysLeftOverride: interaction.options.getInteger('days_left'),
    addAmount: interaction.options.getNumber('add'),
    removeAmount: interaction.options.getNumber('remove'),
    resetAdjustment: interaction.options.getBoolean('reset_adjustment'),
  };

  if (options.addAmount && options.removeAmount) {
    await interaction.reply({
      content: '❌ Use either `add` or `remove`, not both.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply(); // may take a bit (OCR)

  // Load / init state
  const existing = await prisma.fundingState.findUnique({ where: { guildId: interaction.guild.id } });
  const currentEndDate =
    (options.endDate && isValidIsoDate(options.endDate) ? options.endDate : null) ||
    (existing?.endDate && isValidIsoDate(existing.endDate) ? existing.endDate : null) ||
    (env.FUNDING_END_DATE && isValidIsoDate(env.FUNDING_END_DATE) ? env.FUNDING_END_DATE : null);

  const found = await findLatestImageMessage(textChannel);
  if (!found) {
    await interaction.editReply(
      `❌ No recent image found in <#${env.FUNDING_CHANNEL_ID}>. Upload the table image there first.`,
    );
    return;
  }

  // Apply manual adjustment updates
  let manualAdjustmentPence = existing?.manualAdjustmentPence ?? 0;
  if (options.resetAdjustment) manualAdjustmentPence = 0;
  if (options.addAmount !== null && options.addAmount !== undefined) manualAdjustmentPence -= poundsToPence(options.addAmount);
  if (options.removeAmount !== null && options.removeAmount !== undefined)
    manualAdjustmentPence += poundsToPence(options.removeAmount);

  // OCR and parse
  const buffer = await fetchBuffer(found.imageUrl);
  const ocr = await recognizeImage(buffer);
  const parsed = extractNeededValuesFromWords(ocr.words);

  // Persist state
  await prisma.fundingState.upsert({
    where: { guildId: interaction.guild.id },
    create: {
      guildId: interaction.guild.id,
      channelId: env.FUNDING_CHANNEL_ID,
      endDate: currentEndDate,
      manualAdjustmentPence,
      lastImageMessageId: found.messageId,
      lastImageUrl: found.imageUrl,
      lastOcrText: ocr.text,
      lastParsedNeededValues: parsed.neededPenceValues,
      lastParsedTotalPence: parsed.totalPence,
    },
    update: {
      channelId: env.FUNDING_CHANNEL_ID,
      endDate: currentEndDate,
      manualAdjustmentPence,
      lastImageMessageId: found.messageId,
      lastImageUrl: found.imageUrl,
      lastOcrText: ocr.text,
      lastParsedNeededValues: parsed.neededPenceValues,
      lastParsedTotalPence: parsed.totalPence,
    },
  });

  const remainingTotalPence = parsed.totalPence + manualAdjustmentPence;

  const shiftInfo = getUkShiftInfo(new Date());
  const daysLeft =
    options.daysLeftOverride && options.daysLeftOverride > 0
      ? options.daysLeftOverride
      : currentEndDate
        ? Math.max(1, daysBetweenIsoInclusive(shiftInfo.shiftDayIsoDate, currentEndDate))
        : null;

  if (!daysLeft) {
    await interaction.editReply(
      '❌ Missing end date. Provide `end_date: YYYY-MM-DD` or `days_left`, or set `FUNDING_END_DATE` in env.',
    );
    return;
  }

  const dailyTargetPence = Math.ceil(remainingTotalPence / daysLeft);
  const remainingShifts = shiftInfo.remainingShiftsToday;
  const perShiftPence = Math.ceil(dailyTargetPence / remainingShifts.length);

  const ukTimeStr = `${String(shiftInfo.ukNow.hour).padStart(2, '0')}:${String(shiftInfo.ukNow.minute).padStart(
    2,
    '0',
  )}:${String(shiftInfo.ukNow.second).padStart(2, '0')}`;

  const fields: { name: string; value: string; inline?: boolean }[] = [
    {
      name: 'Total remaining',
      value: `**${formatPence(remainingTotalPence, currencySymbol)}**`,
      inline: true,
    },
    {
      name: 'Days left',
      value: currentEndDate ? `**${daysLeft}** (until **${currentEndDate}**)` : `**${daysLeft}**`,
      inline: true,
    },
    {
      name: 'Daily target',
      value: `**${formatPence(dailyTargetPence, currencySymbol)}** / day`,
      inline: true,
    },
    {
      name: 'UK time / shift',
      value: `**${ukTimeStr}** • Current: **${shiftInfo.currentShift}**`,
      inline: false,
    },
    {
      name: 'Today (remaining shifts only)',
      value: remainingShifts
        .map((s, idx) => {
          const label = idx === 0 ? `**${s} (current)**` : `**${s}**`;
          return `${label}: ${formatPence(perShiftPence, currencySymbol)}`;
        })
        .join('\n'),
      inline: false,
    },
  ];

  if (manualAdjustmentPence !== 0) {
    fields.splice(1, 0, {
      name: 'Manual adjustment',
      value: `**${formatPence(manualAdjustmentPence, currencySymbol)}** (applied to total)`,
      inline: true,
    });
  }

  const preview = renderRowsForEmbed(parsed.rows, currencySymbol, 12);
  if (preview.text) {
    fields.push({
      name: 'Top rows (from latest table)',
      value: preview.text.length > 1024 ? preview.text.slice(0, 1021) + '…' : preview.text,
      inline: false,
    });
  }

  await interaction.editReply({
    embeds: [
      {
        title: 'Funding targets (recalculated)',
        description: `Parsed **${parsed.rows.length}** rows from the latest table image in <#${env.FUNDING_CHANNEL_ID}>.`,
        color: 0x5865f2,
        fields,
        footer: { text: 'Morning 03:00–11:00 • Day 11:00–19:00 • Night 19:00–03:00 (UK time)' },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}


