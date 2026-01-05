import type { Client, Message, User } from 'discord.js';
import { prisma } from './db/index.js';
import { getEnv } from './env.js';

function getShiftPlaybookSteps(): string[] {
  return [
    // Step 0: Welcome
    '**✅ Shift started**\n\n**Do this now:**\n- Work the playbook below in order\n- Use `/endshift` when you finish',
    
    // Step 1: Opening Routine
    '**1️⃣ Opening Routine (First 30 Minutes) — do this before anything else**\n\n**What to do:**\n- Reply to all unread messages first\n- Send warm openers to recent spenders\n- Do **NOT** sell immediately\n\n**Checklist:**\n- Respond naturally\n- Ask **1 question** per convo\n- Build momentum before selling',
    
    // Step 2: Scan Logic
    '**2️⃣ Scan Logic (Who to message / Who to ignore)**\n\n**Message these users:**\n- Active in last 7 days\n- Unlocked PPV before\n- Previously tipped\n- Online now\n\n**Ignore for now:**\n- No activity 30+ days\n- Never unlocked or replied\n- Ghosts already messaged today\n\n**Rule:** Prioritise quality convos over mass spam.',
    
    // Step 3: Reviving Cold Subscribers
    '**3️⃣ Reviving Cold Subscribers**\n\n**Target:** last spend was **7–30 days** ago\n\n**What to send:**\n- Casual check-in\n- Personal tone\n- No selling in first message\n\n**Rule:**\n- If they reply → move to chat flow\n- If no reply → do **NOT** chase same shift',
    
    // Step 4: PPV vs Chat
    '**4️⃣ When to Push PPV vs Chat**\n\n**Push PPV when:**\n- User is engaged\n- Asking questions\n- Complimenting\n- Responding quickly\n\n**Stay in chat when:**\n- Cold replies\n- Short answers\n- Just came online\n\n**Rule:** Never force PPV. Build desire first, then drop content.',
  ];
}

function getOpeningReminderBlock(): string {
  return [
    `⏱️ **30-minute check**`,
    '',
    'Opening routine should be done.',
    '',
    '**Next:** Scan + prioritise quality convos (don't mass spam).',
  ].join('\n');
}

function getPeriodicReminderSteps(): string[] {
  return [
    '**🔄 Shift Reminder — Keep Going!**\n\n**Remember:**',
    '**📋 Scan Logic Reminder**\n\n**Message these:**\n- Active in last 7 days\n- Unlocked PPV before\n- Previously tipped\n- Online now\n\n**Ignore:**\n- No activity 30+ days\n- Never unlocked\n- Ghosts already messaged today',
    '**💬 PPV vs Chat Reminder**\n\n**Push PPV when:**\n- User is engaged\n- Asking questions\n- Complimenting\n- Responding quickly\n\n**Stay in chat when:**\n- Cold replies\n- Short answers\n- Just came online\n\n**Rule:** Never force PPV. Build desire first!',
    '**❄️ Cold Subscribers Reminder**\n\n**Target:** Last spend 7–30 days ago\n\n**What to send:**\n- Casual check-in\n- Personal tone\n- No selling in first message\n\n**Rule:** If no reply → do **NOT** chase same shift.',
  ];
}

function getEndShiftBlock(): string {
  return [
    '**✅ End-of-shift checklist**',
    '',
    '**Before shift ends:**',
    '- Close active convos politely',
    '- Leave soft hooks for next shift',
    '- Do **NOT** hard sell last 10 minutes',
    '',
    'Shift logged. Good work.',
  ].join('\n');
}

export async function sendPlaybookDM(user: User) {
  const dm = await user.createDM();
  const steps = getShiftPlaybookSteps();
  
  // Send each step as a separate message with a small delay between them
  for (let i = 0; i < steps.length; i++) {
    await dm.send({ content: steps[i] });
    // Small delay between messages (500ms) so they don't arrive all at once
    if (i < steps.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

export async function sendOpeningReminderDM(user: User) {
  const dm = await user.createDM();
  await dm.send({ content: getOpeningReminderBlock() });
}

export async function sendPeriodicReminderDM(user: User) {
  const dm = await user.createDM();
  const reminders = getPeriodicReminderSteps();
  
  // Send all reminder steps as separate messages
  for (let i = 0; i < reminders.length; i++) {
    await dm.send({ content: reminders[i] });
    // Small delay between messages
    if (i < reminders.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

export async function sendEndShiftDM(user: User) {
  const dm = await user.createDM();
  await dm.send({ content: getEndShiftBlock() });
}

export async function notifyIsaac(client: Client, message: string) {
  const env = getEnv();
  try {
    const isaac = await client.users.fetch(env.ISAAC_USER_ID);
    const dm = await isaac.createDM();
    await dm.send({ content: message });
  } catch (error) {
    console.error('Failed to notify Isaac:', error);
  }
}

export async function startShift(client: Client, user: User) {
  const active = await prisma.shift.findActiveByUserId(user.id);
  const now = new Date().toISOString();

  // Ensure profile exists
  await prisma.shiftProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, firstSeenAt: now },
    update: { lastStartshiftAt: now },
  });

  if (active) {
    // Re-send playbook without creating a second active shift
    await sendPlaybookDM(user);
    return { created: false, shift: active };
  }

  const shift = await prisma.shift.create({
    data: {
      userId: user.id,
      startTime: now,
      activityCount: 0,
      lastActivityAt: null,
    },
  });

  await sendPlaybookDM(user);
  return { created: true, shift };
}

export async function endShift(client: Client, user: User) {
  const active = await prisma.shift.findActiveByUserId(user.id);
  const now = new Date().toISOString();

  // Ensure profile exists
  await prisma.shiftProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, firstSeenAt: now },
    update: { lastEndshiftAt: now },
  });

  if (!active) {
    return { ended: false, shift: null };
  }

  await prisma.shift.update({
    where: { id: active.id },
    data: { endTime: now },
  });

  await sendEndShiftDM(user);
  return { ended: true, shift: { ...active, endTime: now } };
}

export async function handleShiftMessage(client: Client, message: Message) {
  const env = getEnv();

  // Ignore bots
  if (message.author.bot) return;

  // Only track activity in guild text channels (not DMs)
  if (!message.guild) return;

  const now = new Date();
  const nowIso = now.toISOString();

  const active = await prisma.shift.findActiveByUserId(message.author.id);
  if (active) {
    await prisma.shift.update({
      where: { id: active.id },
      data: {
        activityCount: (active.activityCount ?? 0) + 1,
        lastActivityAt: nowIso,
      },
    });
    return;
  }

  const chatterIds = new Set(
    (env.CHATTER_USER_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

  // Enforce startshift compliance if user is a known chatter profile OR explicitly listed as a chatter
  const profile = await prisma.shiftProfile.findUnique({ where: { userId: message.author.id } });
  if (!profile && !chatterIds.has(message.author.id)) return;

  const cooldownMs = env.SHIFT_MISSING_START_COOLDOWN_MINUTES * 60 * 1000;
  const lastFlag = profile?.lastMissingStartFlagAt ? new Date(profile.lastMissingStartFlagAt) : null;
  const canFlag = !lastFlag || now.getTime() - lastFlag.getTime() > cooldownMs;
  if (!canFlag) return;

  if (profile) {
    await prisma.shiftProfile.update({
      where: { userId: message.author.id },
      data: {
        lastMissingStartFlagAt: nowIso,
        missingStartCount: (profile.missingStartCount ?? 0) + 1,
      },
    });
  } else {
    // First time we’re seeing this chatter (via explicit list) — create profile + initial count
    await prisma.shiftProfile.upsert({
      where: { userId: message.author.id },
      create: { userId: message.author.id },
      update: { lastMissingStartFlagAt: nowIso, missingStartCount: 1 },
    });
  }

  await notifyIsaac(
    client,
    [
      '**⚠️ Shift compliance flag: Missing `/startshift`**',
      `User: <@${message.author.id}>`,
      `Channel: <#${message.channel.id}>`,
      `Time: <t:${Math.floor(now.getTime() / 1000)}:F>`,
    ].join('\n'),
  );

  await maybeFlagRepeatOffender(client, message.author.id);
}

async function maybeFlagRepeatOffender(client: Client, userId: string) {
  const env = getEnv();
  const now = new Date();
  const profile = await prisma.shiftProfile.findUnique({ where: { userId } });
  if (!profile) return;

  const threshold = env.SHIFT_REPEAT_OFFENDER_THRESHOLD;
  const maxCount = Math.max(
    profile.missingStartCount ?? 0,
    profile.missingEndCount ?? 0,
    profile.zeroActivityCount ?? 0,
  );
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


