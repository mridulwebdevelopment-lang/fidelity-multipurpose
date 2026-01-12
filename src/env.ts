import { z } from 'zod';

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_APPLICATION_ID: z.string().min(1),
  DISCORD_DEV_GUILD_ID: z.string().optional().default(''),

  TASKS_CATEGORY_ID: z.string().min(1),
  RED_ALERTS_CHANNEL_ID: z.string().min(1),
  DAILY_SUMMARY_CHANNEL_ID: z.string().min(1),
  STAFF_USER_IDS: z.string().min(1),
  STAFF_ROLE_IDS: z.string().optional().default(''),
  KASH_USER_ID: z.string().min(1),
  RYAN_USER_ID: z.string().min(1),
  ISAAC_USER_ID: z.string().min(1),

  // Funding target tracker (table OCR -> daily/shift targets). Optional: feature is disabled unless channel is set.
  FUNDING_CHANNEL_ID: z.string().optional().default(''),
  // Expected format: YYYY-MM-DD (UK date). If omitted, /update must be passed end_date or days_left.
  FUNDING_END_DATE: z.string().optional().default(''),

  // Shift check-in flow (all optional with sane defaults)
  CHATTER_USER_IDS: z.string().optional().default(''),
  SHIFT_CHANNEL_ID: z.string().optional().default('1457741396218745028'), // Legacy shift check-in channel (unused unless shift features are enabled)
  SHIFT_OPENING_REMINDER_MINUTES: z.coerce.number().int().positive().optional().default(30),
  SHIFT_ZERO_ACTIVITY_MINUTES: z.coerce.number().int().positive().optional().default(60),
  SHIFT_MISSING_END_HOURS: z.coerce.number().int().positive().optional().default(12),
  SHIFT_MISSING_START_COOLDOWN_MINUTES: z.coerce.number().int().positive().optional().default(12 * 60),
  SHIFT_REPEAT_OFFENDER_THRESHOLD: z.coerce.number().int().positive().optional().default(3),
  SHIFT_PERIODIC_REMINDER_HOURS: z.coerce.number().int().positive().optional().default(2),
});

export type Env = z.infer<typeof schema>;

export function getEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Missing or invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables. Check your environment configuration.');
  }
  return parsed.data;
}

export function getStaffUserIds(env: Env): string[] {
  const staffIds = env.STAFF_USER_IDS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  
  // Always include KASH_USER_ID, ISAAC_USER_ID, and RYAN_USER_ID in staff list
  const adminUserIds = [env.KASH_USER_ID, env.ISAAC_USER_ID, env.RYAN_USER_ID];
  for (const userId of adminUserIds) {
    if (userId && !staffIds.includes(userId)) {
      staffIds.push(userId);
    }
  }
  
  return staffIds;
}

export function getStaffRoleIds(env: Env): string[] {
  if (!env.STAFF_ROLE_IDS) return [];
  return env.STAFF_ROLE_IDS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
