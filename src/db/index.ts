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
