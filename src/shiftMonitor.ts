import type { Client } from 'discord.js';
import { prisma } from './db/index.js';
import { getEnv } from './env.js';
import { notifyIsaac, sendOpeningReminderDM, sendPeriodicReminderDM } from './shifts.js';

export function startShiftMonitor(client: Client) {
  // Check every 5 minutes
  setInterval(async () => {
    try {
      await checkShifts(client);
    } catch (error) {
      console.error('Error in shift monitor:', error);
    }
  }, 5 * 60 * 1000);

  // Also run immediately
  checkShifts(client).catch((error) => {
    console.error('Error in initial shift monitor run:', error);
  });
}

async function checkShifts(client: Client) {
  const env = getEnv();
  const now = new Date();

  const openingReminderThreshold = new Date(
    now.getTime() - env.SHIFT_OPENING_REMINDER_MINUTES * 60 * 1000,
  ).toISOString();
  const periodicReminderThreshold = new Date(
    now.getTime() - env.SHIFT_PERIODIC_REMINDER_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const zeroActivityThreshold = new Date(now.getTime() - env.SHIFT_ZERO_ACTIVITY_MINUTES * 60 * 1000).toISOString();
  const missingEndThreshold = new Date(now.getTime() - env.SHIFT_MISSING_END_HOURS * 60 * 60 * 1000).toISOString();

  const activeShifts = await prisma.shift.findMany({
    where: { endTimeIsNull: true },
    orderBy: { startTime: 'asc' },
  });

  for (const shift of activeShifts) {
    // Opening reminder
    if (!shift.openingReminderSentAt && shift.startTime < openingReminderThreshold) {
      try {
        const user = await client.users.fetch(shift.userId);
        await sendOpeningReminderDM(user);
        await prisma.shift.update({
          where: { id: shift.id },
          data: { openingReminderSentAt: now.toISOString() },
        });
      } catch (error) {
        console.error('Failed sending opening reminder:', error);
      }
    }

    // Periodic reminder (every X hours, repeating key playbook points)
    const lastPeriodic = shift.lastPeriodicReminderAt ? new Date(shift.lastPeriodicReminderAt) : new Date(shift.startTime);
    const needsPeriodicReminder = lastPeriodic.toISOString() < periodicReminderThreshold;
    
    if (needsPeriodicReminder) {
      try {
        const user = await client.users.fetch(shift.userId);
        await sendPeriodicReminderDM(user);
        await prisma.shift.update({
          where: { id: shift.id },
          data: { lastPeriodicReminderAt: now.toISOString() },
        });
      } catch (error) {
        console.error('Failed sending periodic reminder:', error);
      }
    }

    // Zero activity flag
    if (
      (shift.activityCount ?? 0) === 0 &&
      !shift.flaggedZeroActivityAt &&
      shift.startTime < zeroActivityThreshold
    ) {
      const profile = (await prisma.shiftProfile.findUnique({ where: { userId: shift.userId } })) ??
        (await prisma.shiftProfile.upsert({
          where: { userId: shift.userId },
          create: { userId: shift.userId, firstSeenAt: now.toISOString() },
          update: {},
        }));

      await prisma.shift.update({
        where: { id: shift.id },
        data: { flaggedZeroActivityAt: now.toISOString() },
      });

      await prisma.shiftProfile.update({
        where: { userId: shift.userId },
        data: { zeroActivityCount: (profile.zeroActivityCount ?? 0) + 1 },
      });

      await notifyIsaac(
        client,
        [
          '**⚠️ Shift compliance flag: Zero activity during shift**',
          `User: <@${shift.userId}>`,
          `Shift started: <t:${Math.floor(new Date(shift.startTime).getTime() / 1000)}:F>`,
          `Time now: <t:${Math.floor(now.getTime() / 1000)}:F>`,
        ].join('\n'),
      );

      await maybeFlagRepeatOffender(client, shift.userId);
    }

    // Missing endshift flag
    if (!shift.flaggedMissingEndAt && shift.startTime < missingEndThreshold) {
      const profile = (await prisma.shiftProfile.findUnique({ where: { userId: shift.userId } })) ??
        (await prisma.shiftProfile.upsert({
          where: { userId: shift.userId },
          create: { userId: shift.userId, firstSeenAt: now.toISOString() },
          update: {},
        }));

      await prisma.shift.update({
        where: { id: shift.id },
        data: { flaggedMissingEndAt: now.toISOString() },
      });

      await prisma.shiftProfile.update({
        where: { userId: shift.userId },
        data: { missingEndCount: (profile.missingEndCount ?? 0) + 1 },
      });

      await notifyIsaac(
        client,
        [
          '**⚠️ Shift compliance flag: Missing `/endshift`**',
          `User: <@${shift.userId}>`,
          `Shift started: <t:${Math.floor(new Date(shift.startTime).getTime() / 1000)}:F>`,
          `Time now: <t:${Math.floor(now.getTime() / 1000)}:F>`,
        ].join('\n'),
      );

      await maybeFlagRepeatOffender(client, shift.userId);
    }
  }
}

async function maybeFlagRepeatOffender(client: Client, userId: string) {
  const env = getEnv();
  const now = new Date();
  const profile = await prisma.shiftProfile.findUnique({ where: { userId } });
  if (!profile) return;

  const threshold = env.SHIFT_REPEAT_OFFENDER_THRESHOLD;
  const maxCount = Math.max(profile.missingStartCount ?? 0, profile.missingEndCount ?? 0, profile.zeroActivityCount ?? 0);
  if (maxCount < threshold) return;

  // Rate limit repeat-offender flags to once per day per user
  const last = profile.lastRepeatOffenderFlagAt ? new Date(profile.lastRepeatOffenderFlagAt) : null;
  if (last && now.getTime() - last.getTime() < 24 * 60 * 60 * 1000) return;

  await prisma.shiftProfile.update({
    where: { userId },
    data: { lastRepeatOffenderFlagAt: now.toISOString() },
  });

  await notifyIsaac(
    client,
    [
      '**🚩 Repeat shift compliance misses**',
      `User: <@${userId}>`,
      `Missing start: ${profile.missingStartCount ?? 0}`,
      `Missing end: ${profile.missingEndCount ?? 0}`,
      `Zero activity: ${profile.zeroActivityCount ?? 0}`,
      `Threshold: ${threshold}`,
    ].join('\n'),
  );
}


