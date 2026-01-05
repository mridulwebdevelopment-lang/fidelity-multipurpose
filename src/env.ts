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
  return env.STAFF_USER_IDS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getStaffRoleIds(env: Env): string[] {
  if (!env.STAFF_ROLE_IDS) return [];
  return env.STAFF_ROLE_IDS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
