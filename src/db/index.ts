import { createClient } from '@supabase/supabase-js';
import { getEnv } from '../env.js';

// Enums
export enum TaskStatus {
  pending = 'pending',
  in_progress = 'in_progress',
  completed = 'completed',
  cancelled = 'cancelled',
}

export enum TaskPriority {
  low = 'low',
  medium = 'medium',
  high = 'high',
  urgent = 'urgent',
}

// Initialize Supabase client
let supabase: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!supabase) {
    const env = getEnv();
    supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return supabase;
}

// Helper to convert snake_case to camelCase
function toCamelCase(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (typeof obj !== 'object') return obj;
  
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = toCamelCase(value);
  }
  return result;
}

// Helper to convert camelCase to snake_case
function toSnakeCase(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  if (typeof obj !== 'object') return obj;
  
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    result[snakeKey] = toSnakeCase(value);
  }
  return result;
}

// Prisma-compatible interface
export const prisma = {
  task: {
    findUnique: async (query: { where: { id?: string; channelId?: string }; include?: any }) => {
      let supabaseQuery = getSupabase().from('tasks').select('*');
      
      if (query.where.id) {
        supabaseQuery = supabaseQuery.eq('id', query.where.id);
      } else if (query.where.channelId) {
        supabaseQuery = supabaseQuery.eq('channel_id', query.where.channelId);
      } else {
        return null;
      }
      
      const { data, error } = await supabaseQuery.single();
      if (error && error.code !== 'PGRST116') throw error;
      if (!data) return null;

      const taskData: any = {
        id: data.id,
        title: data.title,
        description: data.description,
        assignedToUserId: data.assigned_to_user_id,
        assignedByUserId: data.assigned_by_user_id,
        status: data.status,
        priority: data.priority,
        deadline: data.deadline,
        channelId: data.channel_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        lastRemindedAt: data.last_reminded_at,
        escalationCount: data.escalation_count || 0,
        proofImageUrl: data.proof_image_url || null,
      };

      return taskData;
    },
    findMany: async (query: { 
      where?: any; 
      orderBy?: any; 
      take?: number;
      include?: any;
    }) => {
      let supabaseQuery = getSupabase().from('tasks').select('*');
      
      if (query.where?.assignedToUserId) {
        supabaseQuery = supabaseQuery.eq('assigned_to_user_id', query.where.assignedToUserId);
      }
      if (query.where?.channelId) {
        supabaseQuery = supabaseQuery.eq('channel_id', query.where.channelId);
      }
      if (query.where?.status) {
        supabaseQuery = supabaseQuery.eq('status', query.where.status);
      }
      if (query.where?.statusIn) {
        supabaseQuery = supabaseQuery.in('status', query.where.statusIn);
      }
      
      if (query.orderBy?.deadline === 'asc') {
        supabaseQuery = supabaseQuery.order('deadline', { ascending: true });
      } else if (query.orderBy?.createdAt === 'desc') {
        supabaseQuery = supabaseQuery.order('created_at', { ascending: false });
      }
      
      if (query.take) {
        supabaseQuery = supabaseQuery.limit(query.take);
      }
      
      const { data, error } = await supabaseQuery;
      if (error) throw error;
      
      return (data || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        assignedToUserId: t.assigned_to_user_id,
        assignedByUserId: t.assigned_by_user_id,
        status: t.status,
        priority: t.priority,
        deadline: t.deadline,
        channelId: t.channel_id,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        lastRemindedAt: t.last_reminded_at,
        escalationCount: t.escalation_count || 0,
        proofImageUrl: t.proof_image_url || null,
      }));
    },
    create: async (data: { data: any }) => {
      const taskData = {
        title: data.data.title,
        description: data.data.description || null,
        assigned_to_user_id: data.data.assignedToUserId,
        assigned_by_user_id: data.data.assignedByUserId,
        status: data.data.status || TaskStatus.pending,
        priority: data.data.priority || TaskPriority.medium,
        deadline: data.data.deadline ? new Date(data.data.deadline).toISOString() : null,
        channel_id: data.data.channelId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_reminded_at: null,
        escalation_count: 0,
      };

      const { data: task, error } = await getSupabase()
        .from('tasks')
        .insert(taskData)
        .select()
        .single();
      
      if (error) throw error;

      return {
        id: task.id,
        title: task.title,
        description: task.description,
        assignedToUserId: task.assigned_to_user_id,
        assignedByUserId: task.assigned_by_user_id,
        status: task.status,
        priority: task.priority,
        deadline: task.deadline,
        channelId: task.channel_id,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        lastRemindedAt: task.last_reminded_at,
        escalationCount: task.escalation_count || 0,
        proofImageUrl: task.proof_image_url || null,
      };
    },
    update: async (data: { where: { id: string }; data: any }) => {
      const updates: any = {
        updated_at: new Date().toISOString(),
      };
      
      if (data.data.status !== undefined) updates.status = data.data.status;
      if (data.data.priority !== undefined) updates.priority = data.data.priority;
      if (data.data.deadline !== undefined) {
        updates.deadline = data.data.deadline ? new Date(data.data.deadline).toISOString() : null;
      }
      if (data.data.lastRemindedAt !== undefined) {
        updates.last_reminded_at = data.data.lastRemindedAt 
          ? new Date(data.data.lastRemindedAt).toISOString() 
          : null;
      }
      if (data.data.escalationCount !== undefined) {
        updates.escalation_count = data.data.escalationCount;
      }
      if (data.data.proofImageUrl !== undefined) {
        updates.proof_image_url = data.data.proofImageUrl;
      }

      const { error } = await getSupabase()
        .from('tasks')
        .update(updates)
        .eq('id', data.where.id);
      
      if (error) throw error;
      return { id: data.where.id };
    },
  },
  shiftProfile: {
    findUnique: async (query: { where: { userId: string } }) => {
      const { data, error } = await getSupabase()
        .from('shift_profiles')
        .select('*')
        .eq('user_id', query.where.userId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        userId: data.user_id,
        firstSeenAt: data.first_seen_at,
        lastStartshiftAt: data.last_startshift_at,
        lastEndshiftAt: data.last_endshift_at,
        lastMissingStartFlagAt: data.last_missing_start_flag_at,
        missingStartCount: data.missing_start_count ?? 0,
        missingEndCount: data.missing_end_count ?? 0,
        zeroActivityCount: data.zero_activity_count ?? 0,
        lastRepeatOffenderFlagAt: data.last_repeat_offender_flag_at ?? null,
      };
    },
    upsert: async (query: { where: { userId: string }; create?: any; update?: any }) => {
      const userId = query.where.userId;
      const createData = query.create ?? {};
      const updateData = query.update ?? {};

      // IMPORTANT: Supabase upsert updates any provided columns.
      // Only include fields we explicitly want to set, to avoid overwriting existing values with nulls.
      const payload: any = { user_id: userId };

      const lastStartshiftAt = updateData.lastStartshiftAt ?? createData.lastStartshiftAt;
      if (lastStartshiftAt !== undefined) payload.last_startshift_at = lastStartshiftAt;

      const lastEndshiftAt = updateData.lastEndshiftAt ?? createData.lastEndshiftAt;
      if (lastEndshiftAt !== undefined) payload.last_endshift_at = lastEndshiftAt;

      const lastMissingStartFlagAt =
        updateData.lastMissingStartFlagAt ?? createData.lastMissingStartFlagAt;
      if (lastMissingStartFlagAt !== undefined) payload.last_missing_start_flag_at = lastMissingStartFlagAt;

      const missingStartCount = updateData.missingStartCount ?? createData.missingStartCount;
      if (missingStartCount !== undefined) payload.missing_start_count = missingStartCount;

      const missingEndCount = updateData.missingEndCount ?? createData.missingEndCount;
      if (missingEndCount !== undefined) payload.missing_end_count = missingEndCount;

      const zeroActivityCount = updateData.zeroActivityCount ?? createData.zeroActivityCount;
      if (zeroActivityCount !== undefined) payload.zero_activity_count = zeroActivityCount;

      const lastRepeatOffenderFlagAt =
        updateData.lastRepeatOffenderFlagAt ?? createData.lastRepeatOffenderFlagAt;
      if (lastRepeatOffenderFlagAt !== undefined) payload.last_repeat_offender_flag_at = lastRepeatOffenderFlagAt;

      const { data, error } = await getSupabase()
        .from('shift_profiles')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) throw error;

      return {
        userId: data.user_id,
        firstSeenAt: data.first_seen_at,
        lastStartshiftAt: data.last_startshift_at,
        lastEndshiftAt: data.last_endshift_at,
        lastMissingStartFlagAt: data.last_missing_start_flag_at,
        missingStartCount: data.missing_start_count ?? 0,
        missingEndCount: data.missing_end_count ?? 0,
        zeroActivityCount: data.zero_activity_count ?? 0,
        lastRepeatOffenderFlagAt: data.last_repeat_offender_flag_at ?? null,
      };
    },
    update: async (query: { where: { userId: string }; data: any }) => {
      const updates: any = {};
      if (query.data.lastStartshiftAt !== undefined) updates.last_startshift_at = query.data.lastStartshiftAt;
      if (query.data.lastEndshiftAt !== undefined) updates.last_endshift_at = query.data.lastEndshiftAt;
      if (query.data.lastMissingStartFlagAt !== undefined)
        updates.last_missing_start_flag_at = query.data.lastMissingStartFlagAt;
      if (query.data.missingStartCount !== undefined) updates.missing_start_count = query.data.missingStartCount;
      if (query.data.missingEndCount !== undefined) updates.missing_end_count = query.data.missingEndCount;
      if (query.data.zeroActivityCount !== undefined) updates.zero_activity_count = query.data.zeroActivityCount;
      if (query.data.lastRepeatOffenderFlagAt !== undefined)
        updates.last_repeat_offender_flag_at = query.data.lastRepeatOffenderFlagAt;

      const { error } = await getSupabase().from('shift_profiles').update(updates).eq('user_id', query.where.userId);
      if (error) throw error;
      return { userId: query.where.userId };
    },
  },
  shift: {
    create: async (query: { data: any }) => {
      const now = new Date().toISOString();
      const payload: any = {
        user_id: query.data.userId,
        start_time: query.data.startTime ?? now,
        end_time: query.data.endTime ?? null,
        opening_reminder_sent_at: query.data.openingReminderSentAt ?? null,
        last_periodic_reminder_at: query.data.lastPeriodicReminderAt ?? null,
        activity_count: query.data.activityCount ?? 0,
        last_activity_at: query.data.lastActivityAt ?? null,
        flagged_zero_activity_at: query.data.flaggedZeroActivityAt ?? null,
        flagged_missing_end_at: query.data.flaggedMissingEndAt ?? null,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await getSupabase().from('shifts').insert(payload).select().single();
      if (error) throw error;

      return {
        id: data.id,
        userId: data.user_id,
        startTime: data.start_time,
        endTime: data.end_time,
        openingReminderSentAt: data.opening_reminder_sent_at,
        lastPeriodicReminderAt: data.last_periodic_reminder_at,
        activityCount: data.activity_count ?? 0,
        lastActivityAt: data.last_activity_at,
        flaggedZeroActivityAt: data.flagged_zero_activity_at,
        flaggedMissingEndAt: data.flagged_missing_end_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    },
    findActiveByUserId: async (userId: string) => {
      const { data, error } = await getSupabase()
        .from('shifts')
        .select('*')
        .eq('user_id', userId)
        .is('end_time', null)
        .order('start_time', { ascending: false })
        .limit(1);

      if (error) throw error;
      const row = data?.[0];
      if (!row) return null;

      return {
        id: row.id,
        userId: row.user_id,
        startTime: row.start_time,
        endTime: row.end_time,
        openingReminderSentAt: row.opening_reminder_sent_at,
        lastPeriodicReminderAt: row.last_periodic_reminder_at,
        activityCount: row.activity_count ?? 0,
        lastActivityAt: row.last_activity_at,
        flaggedZeroActivityAt: row.flagged_zero_activity_at,
        flaggedMissingEndAt: row.flagged_missing_end_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
    findMany: async (query: { where?: any; orderBy?: any; take?: number }) => {
      let supabaseQuery = getSupabase().from('shifts').select('*');

      if (query.where?.endTimeIsNull === true) {
        supabaseQuery = supabaseQuery.is('end_time', null);
      }
      if (query.where?.userId) {
        supabaseQuery = supabaseQuery.eq('user_id', query.where.userId);
      }
      if (query.where?.startTimeLt) {
        supabaseQuery = supabaseQuery.lt('start_time', query.where.startTimeLt);
      }
      if (query.where?.activityCountEq !== undefined) {
        supabaseQuery = supabaseQuery.eq('activity_count', query.where.activityCountEq);
      }
      if (query.where?.openingReminderSentAtIsNull === true) {
        supabaseQuery = supabaseQuery.is('opening_reminder_sent_at', null);
      }
      if (query.where?.flaggedZeroActivityAtIsNull === true) {
        supabaseQuery = supabaseQuery.is('flagged_zero_activity_at', null);
      }
      if (query.where?.flaggedMissingEndAtIsNull === true) {
        supabaseQuery = supabaseQuery.is('flagged_missing_end_at', null);
      }

      if (query.orderBy?.startTime === 'asc') {
        supabaseQuery = supabaseQuery.order('start_time', { ascending: true });
      } else if (query.orderBy?.startTime === 'desc') {
        supabaseQuery = supabaseQuery.order('start_time', { ascending: false });
      }

      if (query.take) supabaseQuery = supabaseQuery.limit(query.take);

      const { data, error } = await supabaseQuery;
      if (error) throw error;

      return (data ?? []).map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        startTime: row.start_time,
        endTime: row.end_time,
        openingReminderSentAt: row.opening_reminder_sent_at,
        lastPeriodicReminderAt: row.last_periodic_reminder_at,
        activityCount: row.activity_count ?? 0,
        lastActivityAt: row.last_activity_at,
        flaggedZeroActivityAt: row.flagged_zero_activity_at,
        flaggedMissingEndAt: row.flagged_missing_end_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    },
    update: async (query: { where: { id: string }; data: any }) => {
      const updates: any = {
        updated_at: new Date().toISOString(),
      };

      if (query.data.endTime !== undefined) updates.end_time = query.data.endTime;
      if (query.data.openingReminderSentAt !== undefined)
        updates.opening_reminder_sent_at = query.data.openingReminderSentAt;
      if (query.data.lastPeriodicReminderAt !== undefined)
        updates.last_periodic_reminder_at = query.data.lastPeriodicReminderAt;
      if (query.data.activityCount !== undefined) updates.activity_count = query.data.activityCount;
      if (query.data.lastActivityAt !== undefined) updates.last_activity_at = query.data.lastActivityAt;
      if (query.data.flaggedZeroActivityAt !== undefined)
        updates.flagged_zero_activity_at = query.data.flaggedZeroActivityAt;
      if (query.data.flaggedMissingEndAt !== undefined)
        updates.flagged_missing_end_at = query.data.flaggedMissingEndAt;

      const { error } = await getSupabase().from('shifts').update(updates).eq('id', query.where.id);
      if (error) throw error;
      return { id: query.where.id };
    },
  },
  fundingState: {
    findUnique: async (query: { where: { guildId: string } }) => {
      const { data, error } = await getSupabase()
        .from('funding_states')
        .select('*')
        .eq('guild_id', query.where.guildId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        guildId: data.guild_id,
        channelId: data.channel_id,
        endDate: data.end_date,
        manualAdjustmentPence: Number(data.manual_adjustment_pence ?? 0),
        lastImageMessageId: data.last_image_message_id ?? null,
        lastImageUrl: data.last_image_url ?? null,
        lastOcrText: data.last_ocr_text ?? null,
        lastParsedNeededValues: data.last_parsed_needed_values ?? null,
        lastParsedTotalPence: data.last_parsed_total_pence !== null && data.last_parsed_total_pence !== undefined
          ? Number(data.last_parsed_total_pence)
          : null,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    },
    upsert: async (query: { where: { guildId: string }; create: any; update: any }) => {
      const guildId = query.where.guildId;
      const now = new Date().toISOString();
      const payload: any = {
        guild_id: guildId,
        channel_id: query.update?.channelId ?? query.create?.channelId,
        end_date: query.update?.endDate ?? query.create?.endDate ?? null,
        manual_adjustment_pence:
          query.update?.manualAdjustmentPence ?? query.create?.manualAdjustmentPence ?? 0,
        last_image_message_id:
          query.update?.lastImageMessageId ?? query.create?.lastImageMessageId ?? null,
        last_image_url: query.update?.lastImageUrl ?? query.create?.lastImageUrl ?? null,
        last_ocr_text: query.update?.lastOcrText ?? query.create?.lastOcrText ?? null,
        last_parsed_needed_values:
          query.update?.lastParsedNeededValues ?? query.create?.lastParsedNeededValues ?? null,
        last_parsed_total_pence:
          query.update?.lastParsedTotalPence ?? query.create?.lastParsedTotalPence ?? null,
        updated_at: now,
      };

      // created_at should only be set on insert; Supabase upsert will overwrite if provided, so omit it.
      const { data, error } = await getSupabase()
        .from('funding_states')
        .upsert(payload, { onConflict: 'guild_id' })
        .select()
        .single();

      if (error) throw error;

      return {
        guildId: data.guild_id,
        channelId: data.channel_id,
        endDate: data.end_date,
        manualAdjustmentPence: Number(data.manual_adjustment_pence ?? 0),
        lastImageMessageId: data.last_image_message_id ?? null,
        lastImageUrl: data.last_image_url ?? null,
        lastOcrText: data.last_ocr_text ?? null,
        lastParsedNeededValues: data.last_parsed_needed_values ?? null,
        lastParsedTotalPence: data.last_parsed_total_pence !== null && data.last_parsed_total_pence !== undefined
          ? Number(data.last_parsed_total_pence)
          : null,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    },
    update: async (query: { where: { guildId: string }; data: any }) => {
      const updates: any = { updated_at: new Date().toISOString() };
      if (query.data.channelId !== undefined) updates.channel_id = query.data.channelId;
      if (query.data.endDate !== undefined) updates.end_date = query.data.endDate;
      if (query.data.manualAdjustmentPence !== undefined)
        updates.manual_adjustment_pence = query.data.manualAdjustmentPence;
      if (query.data.lastImageMessageId !== undefined)
        updates.last_image_message_id = query.data.lastImageMessageId;
      if (query.data.lastImageUrl !== undefined) updates.last_image_url = query.data.lastImageUrl;
      if (query.data.lastOcrText !== undefined) updates.last_ocr_text = query.data.lastOcrText;
      if (query.data.lastParsedNeededValues !== undefined)
        updates.last_parsed_needed_values = query.data.lastParsedNeededValues;
      if (query.data.lastParsedTotalPence !== undefined)
        updates.last_parsed_total_pence = query.data.lastParsedTotalPence;

      const { error } = await getSupabase()
        .from('funding_states')
        .update(updates)
        .eq('guild_id', query.where.guildId);
      if (error) throw error;
      return { guildId: query.where.guildId };
    },
  },
};

// Test database connection on startup
async function testConnection() {
  try {
    const { data, error } = await getSupabase().from('tasks').select('id').limit(1);
    if (error) {
      // If table doesn't exist, that's OK - just means migration hasn't been run yet
      if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
        console.log('⚠️  Tasks table not found. Please run the migration SQL in Supabase.');
        console.log('   Run the SQL from: tasks_migration.sql or multipurpose-bot/bot/supabase_migration.sql');
        return false;
      }
      throw error;
    }
    console.log('✅ Database connection successful');
    return true;
  } catch (error: any) {
    console.error('❌ Database connection failed:', error.message || error);
    console.error('Check that SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are correct');
    return false;
  }
}

// Test connection asynchronously (don't block startup)
testConnection().catch(() => {
  // Connection test failed, but continue - queries will retry
});

console.log('Using Supabase client for tasks');
