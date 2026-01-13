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
  maxLines = 999, // Show all rows by default (Discord embed limit is ~6000 chars)
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
  // Show all rows, but respect Discord's ~6000 character limit per field
  const MAX_FIELD_LENGTH = 5500; // Leave some buffer
  let currentLength = 0;
  
  for (const r of sorted) {
    const lowConf = r.confidence < 60;
    if (lowConf) flaggedCount++;
    const flag = lowConf ? '⚠️ ' : '';
    const name = r.name.length > 35 ? r.name.slice(0, 34) + '…' : r.name;
    const valueStr = r.neededPence === null ? '**—**' : formatPence(r.neededPence, currencySymbol);
    const line = `${flag}**${name}** — ${valueStr}${r.neededPence !== null ? ` (conf ${r.confidence}%)` : ''}`;
    
    // Check if adding this line would exceed the limit
    if (currentLength + line.length + 1 > MAX_FIELD_LENGTH && lines.length > 0) {
      const remaining = sorted.length - lines.length;
      if (remaining > 0) {
        lines.push(`\n…and **${remaining}** more rows (truncated due to Discord limits)`);
      }
      break;
    }
    
    lines.push(line);
    currentLength += line.length + 1; // +1 for newline
  }
  
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

  // Get the uploaded image attachment
  const attachment = interaction.options.getAttachment('image', true);
  if (!attachment) {
    await interaction.reply({
      content: '❌ Please upload an image attachment with the `/update` command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Validate it's an image
  if (!isImageAttachment(attachment)) {
    await interaction.reply({
      content: '❌ The attachment must be an image (PNG, JPG, GIF, or WebP).',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

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

  // Apply manual adjustment updates
  let manualAdjustmentPence = existing?.manualAdjustmentPence ?? 0;
  if (options.resetAdjustment) manualAdjustmentPence = 0;
  if (options.addAmount !== null && options.addAmount !== undefined) manualAdjustmentPence -= poundsToPence(options.addAmount);
  if (options.removeAmount !== null && options.removeAmount !== undefined)
    manualAdjustmentPence += poundsToPence(options.removeAmount);

  // OCR and parse the uploaded image
  const buffer = await fetchBuffer(attachment.url);
  const ocr = await recognizeImage(buffer);
  const parsed = extractNeededValuesFromWords(ocr.words);

  // Persist state (use a placeholder message ID since we're not storing the message)
  const placeholderMessageId = `update-${Date.now()}`;
  await prisma.fundingState.upsert({
    where: { guildId: interaction.guild.id },
    create: {
      guildId: interaction.guild.id,
      channelId: env.FUNDING_CHANNEL_ID,
      endDate: currentEndDate,
      manualAdjustmentPence,
      lastImageMessageId: placeholderMessageId,
      lastImageUrl: attachment.url,
      lastOcrText: ocr.text,
      lastParsedNeededValues: parsed.neededPenceValues,
      lastParsedTotalPence: parsed.totalPence,
    },
    update: {
      channelId: env.FUNDING_CHANNEL_ID,
      endDate: currentEndDate,
      manualAdjustmentPence,
      lastImageMessageId: placeholderMessageId,
      lastImageUrl: attachment.url,
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

    const preview = renderRowsForEmbed(parsed.rows, currencySymbol);
    const fieldsWithPreview: { name: string; value: string; inline?: boolean }[] = [
      {
        name: `📊 Parsed rows (${parsed.rows.length} total)`,
        value: preview.text || '*No rows found*',
        inline: false,
      },
    ...fields,
  ];

  if (preview.flaggedCount > 0) {
    fieldsWithPreview.splice(1, 0, {
      name: '⚠️ Low confidence rows',
      value: `**${preview.flaggedCount}** row(s) have low OCR confidence. Review carefully.`,
      inline: false,
    });
  }

  await interaction.editReply({
    embeds: [
      {
        title: '💰 Funding targets (recalculated)',
        description: `Parsed **${parsed.rows.length}** rows from uploaded table image (${parsed.neededPenceValues.length} with values).`,
        color: 0x5865f2,
        fields: fieldsWithPreview,
        footer: { text: 'Morning 03:00–11:00 • Day 11:00–19:00 • Night 19:00–03:00 (UK time)' },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

export async function handleUpdateTextCommand(client: Client, message: Message) {
  const env = getEnv();
  if (!env.FUNDING_CHANNEL_ID) return; // feature disabled
  
  if (!message.guild || !message.channel.isTextBased()) return;
  if (message.author.bot) return;
  if (!('send' in message.channel)) return;
  const sendableChannel = message.channel as unknown as { send: (...args: any[]) => Promise<any> };

  const content = message.content.trim().toLowerCase();
  if (content !== '!update' && content !== '/update') return;

  if (!isStaffUser(message.author.id)) {
    await sendableChannel.send({ content: '❌ Only staff can use this command.' });
    return;
  }

  // Check for image attachment
  const image = message.attachments.find((a) => isImageAttachment(a));
  if (!image?.url) {
    await sendableChannel.send({
      content: '❌ Please attach an image to your `!update` message. Upload the funding table image as an attachment.',
    });
    return;
  }

  // Parse options from message content (simple parsing for text command)
  // Format: !update end_date:2024-12-31 days_left:30 add:25.50
  const options: FundingRecalcOptions = {};
  const parts = message.content.split(/\s+/).slice(1); // Skip "!update"
  for (const part of parts) {
    if (part.startsWith('end_date:')) {
      options.endDate = part.split(':')[1];
    } else if (part.startsWith('days_left:')) {
      const val = parseInt(part.split(':')[1]);
      if (!isNaN(val)) options.daysLeftOverride = val;
    } else if (part.startsWith('add:')) {
      const val = parseFloat(part.split(':')[1]);
      if (!isNaN(val)) options.addAmount = val;
    } else if (part.startsWith('remove:')) {
      const val = parseFloat(part.split(':')[1]);
      if (!isNaN(val)) options.removeAmount = val;
    } else if (part === 'reset_adjustment' || part === 'reset') {
      options.resetAdjustment = true;
    }
  }

  if (options.addAmount && options.removeAmount) {
    await sendableChannel.send({ content: '❌ Use either `add:` or `remove:`, not both.' });
    return;
  }

  const ack = await sendableChannel.send({ content: '🧠 Processing table image (OCR)…' });

  try {
    // Load / init state
    const existing = await prisma.fundingState.findUnique({ where: { guildId: message.guild.id } });
    const currentEndDate =
      (options.endDate && isValidIsoDate(options.endDate) ? options.endDate : null) ||
      (existing?.endDate && isValidIsoDate(existing.endDate) ? existing.endDate : null) ||
      (env.FUNDING_END_DATE && isValidIsoDate(env.FUNDING_END_DATE) ? env.FUNDING_END_DATE : null);

    // Apply manual adjustment updates
    let manualAdjustmentPence = existing?.manualAdjustmentPence ?? 0;
    if (options.resetAdjustment) manualAdjustmentPence = 0;
    if (options.addAmount !== null && options.addAmount !== undefined)
      manualAdjustmentPence -= poundsToPence(options.addAmount);
    if (options.removeAmount !== null && options.removeAmount !== undefined)
      manualAdjustmentPence += poundsToPence(options.removeAmount);

    // OCR and parse
    const buffer = await fetchBuffer(image.url);
    const ocr = await recognizeImage(buffer);
    const parsed = extractNeededValuesFromWords(ocr.words);

    // Persist state
    const placeholderMessageId = `update-${Date.now()}`;
    await prisma.fundingState.upsert({
      where: { guildId: message.guild.id },
      create: {
        guildId: message.guild.id,
        channelId: env.FUNDING_CHANNEL_ID,
        endDate: currentEndDate,
        manualAdjustmentPence,
        lastImageMessageId: placeholderMessageId,
        lastImageUrl: image.url,
        lastOcrText: ocr.text,
        lastParsedNeededValues: parsed.neededPenceValues,
        lastParsedTotalPence: parsed.totalPence,
      },
      update: {
        channelId: env.FUNDING_CHANNEL_ID,
        endDate: currentEndDate,
        manualAdjustmentPence,
        lastImageMessageId: placeholderMessageId,
        lastImageUrl: image.url,
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
      await ack.edit({
        content:
          '❌ Missing end date. Add `end_date:YYYY-MM-DD` or `days_left:30` to your command, or set `FUNDING_END_DATE` in env.',
      });
      return;
    }

    const dailyTargetPence = Math.ceil(remainingTotalPence / daysLeft);
    const remainingShifts = shiftInfo.remainingShiftsToday;
    const perShiftPence = Math.ceil(dailyTargetPence / remainingShifts.length);

    const ukTimeStr = `${String(shiftInfo.ukNow.hour).padStart(2, '0')}:${String(shiftInfo.ukNow.minute).padStart(
      2,
      '0',
    )}:${String(shiftInfo.ukNow.second).padStart(2, '0')}`;

    const currencySymbol = '$';

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

    const preview = renderRowsForEmbed(parsed.rows, currencySymbol);
    const fieldsWithPreview: { name: string; value: string; inline?: boolean }[] = [
      {
        name: `📊 Parsed rows (${parsed.rows.length} total)`,
        value: preview.text || '*No rows found*',
        inline: false,
      },
      ...fields,
    ];

    if (preview.flaggedCount > 0) {
      fieldsWithPreview.splice(1, 0, {
        name: '⚠️ Low confidence rows',
        value: `**${preview.flaggedCount}** row(s) have low OCR confidence. Review carefully.`,
        inline: false,
      });
    }

    await ack.edit({
      embeds: [
        {
          title: '💰 Funding targets (recalculated)',
          description: `Parsed **${parsed.rows.length}** rows from uploaded table image (${parsed.neededPenceValues.length} with values).`,
          color: 0x5865f2,
          fields: fieldsWithPreview,
          footer: { text: 'Morning 03:00–11:00 • Day 11:00–19:00 • Night 19:00–03:00 (UK time)' },
          timestamp: new Date().toISOString(),
        },
      ],
    });
  } catch (err: any) {
    await ack.edit({ content: `❌ Failed to process: ${err?.message || String(err)}` }).catch(() => {});
  }
}


