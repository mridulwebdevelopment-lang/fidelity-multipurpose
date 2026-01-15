import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  TextChannel,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma, TaskStatus } from './db/index.js';
import { getEnv, getStaffUserIds } from './env.js';
import { registerCommands } from './discord/registerCommands.js';
import { assignTask, updateTaskStatus, findTaskByChannel } from './tasks.js';
import { startTaskMonitor } from './taskMonitor.js';
import { startDailySummary } from './dailySummary.js';
import { handleTaskChannelMessage } from './messageHandler.js';
import { startShift } from './shifts.js';
import { endShift } from './shifts.js';
import { handleShiftMessage } from './shifts.js';
import { startShiftMonitor } from './shiftMonitor.js';
import { handleFundingChannelMessage } from './funding/index.js';
import { addDaysIso, getUkNow } from './funding/ukTime.js';

const env = getEnv();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

function isStaff(i: ChatInputCommandInteraction) {
  const staffIds = new Set(getStaffUserIds(env));
  const userId = i.user.id;
  return staffIds.has(userId);
}

client.once(Events.ClientReady, async () => {
  // Initialize database connection early
  prisma.task.findMany({ take: 1 }).catch(() => {
    // Just trigger connection, ignore result
  });

  await registerCommands(env);

  startTaskMonitor(client);
  startDailySummary(client);
  startShiftMonitor(client);

  console.log(`Bot ready as ${client.user?.tag}`);
});

// Handle messages in task channels (for image proof detection)
client.on(Events.MessageCreate, async (message) => {
  await handleTaskChannelMessage(message);
  await handleShiftMessage(client, message);
  await handleFundingChannelMessage(message);
});

// Task templates for quick assignment
const TASK_TEMPLATES: Record<string, { title: string; description: string; defaultPriority: string }> = {
  review_content: {
    title: 'Review Content',
    description: 'Review and provide feedback on the provided content',
    defaultPriority: 'medium',
  },
  fix_bug: {
    title: 'Fix Bug',
    description: 'Investigate and fix the reported bug',
    defaultPriority: 'high',
  },
  create_content: {
    title: 'Create Content',
    description: 'Create new content as specified',
    defaultPriority: 'medium',
  },
  follow_up: {
    title: 'Follow Up',
    description: 'Follow up on the previous task or conversation',
    defaultPriority: 'medium',
  },
  research: {
    title: 'Research',
    description: 'Research the specified topic and provide findings',
    defaultPriority: 'low',
  },
  update_docs: {
    title: 'Update Documentation',
    description: 'Update relevant documentation',
    defaultPriority: 'low',
  },
};

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Modal submissions removed - proof is now handled via chat messages

    // Handle button interactions
    if (interaction.isButton()) {
      const customId = interaction.customId;
      
      if (customId.startsWith('task_start_')) {
        const taskId = customId.replace('task_start_', '');
        await handleTaskButton(interaction, taskId, TaskStatus.in_progress);
        return;
      }
      
      if (customId.startsWith('task_complete_')) {
        const taskId = customId.replace('task_complete_', '');
        await handleTaskCompleteButton(interaction, taskId);
        return;
      }
      
      if (customId.startsWith('task_cancel_')) {
        const taskId = customId.replace('task_cancel_', '');
        await handleTaskButton(interaction, taskId, TaskStatus.cancelled);
        return;
      }
    }

    if (interaction.isChatInputCommand()) {
      console.log(`Command received: /${interaction.commandName} by ${interaction.user.tag} (${interaction.user.id})`);

      if (interaction.commandName === 'rota') {
        // Ensure command is used in a server (not DMs)
        if (!interaction.guild) {
          await interaction.reply({
            content: '❌ This command can only be used in a server, not in DMs.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
          const ukNow = getUkNow();
          const weekStartDate = getWeekStartMondayIso(ukNow.isoDate);
          const weekEndDate = addDaysIso(weekStartDate, 6);

          const allWeekWorking = interaction.options.getBoolean('all_week_working');
          const holidayDay = interaction.options.getString('holiday_day'); // mon..sun

          // If no options are provided, show current saved rota for this week (if any)
          if (!allWeekWorking && !holidayDay) {
            const existing = await prisma.rotaWeek.findUnique({
              where: { userId: interaction.user.id, weekStartDate },
            });

            if (!existing) {
              await interaction.editReply({
                embeds: [
                  {
                    title: '📋 No Rota Found',
                    description: `No rota saved for **${weekStartDate} → ${weekEndDate} (UK week)**.`,
                    fields: [
                      {
                        name: 'How to submit your rota:',
                        value:
                          `• \`/rota all_week_working:true\` - All 7 days working\n` +
                          `• \`/rota holiday_day:<day>\` - One holiday, rest working\n\n` +
                          `**Examples:**\n` +
                          `\`/rota holiday_day:mon\` - Monday off, rest working\n` +
                          `\`/rota holiday_day:fri\` - Friday off, rest working`,
                      },
                    ],
                    color: 0xf59e0b,
                  },
                ],
              });
              return;
            }

            await interaction.editReply({
              embeds: [
                createRotaEmbed({
                  weekStartDate,
                  weekEndDate,
                  schedule: existing.schedule,
                  title: '📋 Your Current Rota',
                  isSaved: false,
                }),
              ],
            });
            return;
          }

          // Build a 7-day schedule (Mon–Sun) where default = Working
          const holidayIndex = holidayDay ? dayKeyToIndex(holidayDay) : null;
          const days = Array.from({ length: 7 }, (_, i) => {
            const date = addDaysIso(weekStartDate, i);
            const isHoliday = holidayIndex !== null && i === holidayIndex;
            return { date, status: isHoliday ? 'holiday' : 'working' };
          });

          const schedule = { days };

          const saved = await prisma.rotaWeek.upsert({
            where: { userId: interaction.user.id, weekStartDate },
            create: { userId: interaction.user.id, weekStartDate, schedule },
            update: { schedule },
          });

          await interaction.editReply({
            embeds: [
              createRotaEmbed({
                weekStartDate,
                weekEndDate,
                schedule: saved.schedule,
                title: '✅ Rota Saved Successfully',
                isSaved: true,
              }),
            ],
          });
        } catch (error: any) {
          console.error('Error handling /rota:', error);
          await interaction.editReply({
            embeds: [
              {
                title: '❌ Error Saving Rota',
                description: `Failed to save rota: ${error.message || 'Unknown error'}`,
                color: 0xef4444,
              },
            ],
          });
        }
        return;
      }

      if (interaction.commandName === 'startshift') {
        // Ensure command is used in a server (not DMs)
        if (!interaction.guild) {
          await interaction.reply({
            content: '❌ This command can only be used in a server, not in DMs.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          console.log(`Starting shift for user ${interaction.user.id}`);
          const result = await startShift(client, interaction.user);
          console.log(`Shift start result:`, result);
          await interaction.editReply({
            embeds: [
              {
                title: result.created ? 'Shift started' : 'Shift already running',
                description: result.created
                  ? '✅ Shift started and logged.\n📬 Check your DMs for the full shift instructions and checklist.'
                  : '⚠️ **Your shift has already started and is currently running.**\n\nPlease end your current shift first using `/endshift` or `!endshift` before starting a new one.',
                color: result.created ? 0x22c55e : 0xf59e0b,
                footer: { text: result.created ? 'Use /endshift or !endshift when you finish.' : 'End your current shift to start a new one.' },
                timestamp: new Date().toISOString(),
              },
            ],
          });
        } catch (error: any) {
          console.error('Error starting shift:', error);
          console.error('Error stack:', error.stack);
          await interaction.editReply({
            embeds: [
              {
                title: '❌ Error',
                description: error.message || 'Failed to start shift',
                color: 0xef4444,
                timestamp: new Date().toISOString(),
              },
            ],
          });
        }
        return;
      }

      if (interaction.commandName === 'endshift') {
        // Ensure command is used in a server (not DMs)
        if (!interaction.guild) {
          await interaction.reply({
            content: '❌ This command can only be used in a server, not in DMs.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          console.log(`Ending shift for user ${interaction.user.id}`);
          const result = await endShift(client, interaction.user);
          console.log(`Shift end result:`, result);
          await interaction.editReply({
            embeds: [
              {
                title: result.ended ? 'Shift ended' : 'No active shift',
                description: result.ended
                  ? '✅ Shift ended and logged.\n📬 Check your DMs for the end-of-shift checklist.'
                  : 'ℹ️ No active shift found to end. Use /startshift or !startshift when you begin.',
                color: result.ended ? 0x22c55e : 0xf59e0b,
                footer: { text: 'You can start a new shift once the previous one is ended.' },
                timestamp: new Date().toISOString(),
              },
            ],
          });
        } catch (error: any) {
          console.error('Error ending shift:', error);
          console.error('Error stack:', error.stack);
          await interaction.editReply({
            embeds: [
              {
                title: '❌ Error',
                description: error.message || 'Failed to end shift',
                color: 0xef4444,
                timestamp: new Date().toISOString(),
              },
            ],
          });
        }
        return;
      }
      
      if (interaction.commandName === 'task') {
        const sub = interaction.options.getSubcommand();
        
        if (sub === 'assign') {
          if (!isStaff(interaction)) {
            await interaction.reply({ 
              content: 'Only staff members can assign tasks.', 
              flags: MessageFlags.Ephemeral 
            });
            return;
          }

          if (!interaction.guild) {
            await interaction.reply({ 
              content: 'This command can only be used in a server.', 
              flags: MessageFlags.Ephemeral 
            });
            return;
          }

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          try {
            const user = interaction.options.getUser('user', true);
            const title = interaction.options.getString('title', true);
            const description = interaction.options.getString('description');
            const priority = interaction.options.getString('priority');
            const deadlineStr = interaction.options.getString('deadline');

            const member = await interaction.guild.members.fetch(user.id);
            
            const { channel, task } = await assignTask(
              env,
              interaction.guild,
              member,
              interaction.user,
              title,
              description,
              priority,
              deadlineStr,
            );

            await interaction.editReply({
              content: `✅ Task assigned to <@${user.id}> in <#${channel.id}>`,
            });
          } catch (error: any) {
            console.error('Error assigning task:', error);
            await interaction.editReply({
              content: `Error: ${error.message || 'Failed to assign task'}`,
            });
          }
          return;
        }

        if (sub === 'quick') {
          if (!isStaff(interaction)) {
            await interaction.reply({ 
              content: 'Only staff members can assign tasks.', 
              flags: MessageFlags.Ephemeral 
            });
            return;
          }

          if (!interaction.guild) {
            await interaction.reply({ 
              content: 'This command can only be used in a server.', 
              flags: MessageFlags.Ephemeral 
            });
            return;
          }

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          try {
            const user = interaction.options.getUser('user', true);
            const templateKey = interaction.options.getString('template', true);
            const details = interaction.options.getString('details');
            const priority = interaction.options.getString('priority');
            const deadlineStr = interaction.options.getString('deadline');

            const template = TASK_TEMPLATES[templateKey];
            if (!template) {
              await interaction.editReply({
                content: 'Invalid template selected.',
              });
              return;
            }

            const title = template.title;
            const description = details 
              ? `${template.description}\n\n**Details:** ${details}`
              : template.description;
            const finalPriority = priority || template.defaultPriority;

            const member = await interaction.guild.members.fetch(user.id);
            
            const { channel, task } = await assignTask(
              env,
              interaction.guild,
              member,
              interaction.user,
              title,
              description,
              finalPriority,
              deadlineStr,
            );

            await interaction.editReply({
              content: `✅ Quick task assigned to <@${user.id}> in <#${channel.id}>`,
            });
          } catch (error: any) {
            console.error('Error assigning quick task:', error);
            await interaction.editReply({
              content: `Error: ${error.message || 'Failed to assign task'}`,
            });
          }
          return;
        }

        if (sub === 'update') {
          if (!interaction.guild || !interaction.channel) {
            await interaction.reply({ 
              content: 'This command can only be used in a server channel.', 
              flags: MessageFlags.Ephemeral 
            });
            return;
          }

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          try {
            const task = await findTaskByChannel(interaction.channel.id);
            if (!task) {
              await interaction.editReply({
                content: 'This channel is not associated with a task.',
              });
              return;
            }

            // Check if user is assigned to this task or is staff
            const isAssigned = task.assignedToUserId === interaction.user.id;
            if (!isAssigned && !isStaff(interaction)) {
              await interaction.editReply({
                content: 'You can only update tasks assigned to you, or you must be staff.',
              });
              return;
            }

            const statusStr = interaction.options.getString('status', true);
            const status = statusStr as TaskStatus;

            await updateTaskStatus(task.id, status, interaction.user.id);

            // Update channel message
            const statusEmoji = {
              [TaskStatus.pending]: '⚪',
              [TaskStatus.in_progress]: '🟡',
              [TaskStatus.completed]: '✅',
              [TaskStatus.cancelled]: '❌',
            }[status];

            if (interaction.channel && interaction.channel.isTextBased() && 'send' in interaction.channel) {
              await (interaction.channel as TextChannel).send({
                content: `<@${task.assignedToUserId}> ${statusEmoji} **Task Status Updated**`,
                embeds: [
                  {
                    title: task.title,
                    description: `Status changed to: **${status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}**`,
                    color: status === TaskStatus.completed ? 0x00ff00 : status === TaskStatus.cancelled ? 0xff0000 : 0xff8800,
                    footer: {
                      text: `Updated by: ${interaction.user.username}`,
                    },
                  },
                ],
              });
            }

            await interaction.editReply({
              content: `✅ Task status updated to **${status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}**`,
            });
          } catch (error: any) {
            console.error('Error updating task:', error);
            await interaction.editReply({
              content: `Error: ${error.message || 'Failed to update task'}`,
            });
          }
          return;
        }

        if (sub === 'list') {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          try {
            const userOption = interaction.options.getUser('user');
            const statusOption = interaction.options.getString('status');

            const where: any = {};
            if (userOption) {
              where.assignedToUserId = userOption.id;
            }
            let tasks = await prisma.task.findMany({
              orderBy: { createdAt: 'desc' },
              take: 50,
            });

            // Filter by user if provided
            if (userOption) {
              tasks = tasks.filter(t => t.assignedToUserId === userOption.id);
            }

            // Filter by status if provided, otherwise only show pending/in_progress
            if (statusOption) {
              tasks = tasks.filter(t => t.status === statusOption);
            } else {
              tasks = tasks.filter(t => t.status === TaskStatus.pending || t.status === TaskStatus.in_progress);
            }

            if (tasks.length === 0) {
              await interaction.editReply({
                embeds: [
                  {
                    title: '📋 Task List',
                    description: 'No tasks found matching your criteria.',
                    color: 0x5865f2,
                  },
                ],
              });
              return;
            }

            // Sort tasks: Priority (urgent > high > medium > low), then deadline (soonest first), then created date (newest first)
            const priorityOrder: Record<string, number> = {
              urgent: 4,
              high: 3,
              medium: 2,
              low: 1,
            };

            tasks.sort((a, b) => {
              // First sort by priority
              const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
              if (priorityDiff !== 0) return priorityDiff;

              // Then by deadline (tasks with deadlines come first, then by date)
              if (a.deadline && b.deadline) {
                return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
              }
              if (a.deadline) return -1;
              if (b.deadline) return 1;

              // Finally by creation date (newest first)
              return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });

            // Priority configuration
            const priorityConfigMap = {
              low: { emoji: '🟢', color: 0x22c55e, name: 'Low' },
              medium: { emoji: '🟡', color: 0xeab308, name: 'Medium' },
              high: { emoji: '🟠', color: 0xf97316, name: 'High' },
              urgent: { emoji: '🔴', color: 0xef4444, name: 'Urgent' },
            };

            const statusConfigMap = {
              [TaskStatus.pending]: { emoji: '⚪', name: 'Pending' },
              [TaskStatus.in_progress]: { emoji: '🟡', name: 'In Progress' },
              [TaskStatus.completed]: { emoji: '✅', name: 'Completed' },
              [TaskStatus.cancelled]: { emoji: '❌', name: 'Cancelled' },
            };

            // Group tasks by status for better organization
            const tasksByStatus = new Map<string, typeof tasks>();
            for (const task of tasks) {
              const statusKey = task.status;
              if (!tasksByStatus.has(statusKey)) {
                tasksByStatus.set(statusKey, []);
              }
              tasksByStatus.get(statusKey)!.push(task);
            }

            // Create embeds with fields (Discord allows up to 25 fields per embed, 6000 chars total)
            const embeds: any[] = [];
            let currentEmbed: any = {
              title: '📋 Task List',
              description: `**Total Tasks:** ${tasks.length}\n*Sorted by priority, deadline, and creation date*`,
              color: 0x5865f2,
              fields: [],
              timestamp: new Date().toISOString(),
            };

            let fieldCount = 0;
            const maxFieldsPerEmbed = 24; // Leave room for footer

            for (const [status, statusTasks] of Array.from(tasksByStatus.entries()).sort((a, b) => {
              // Order: in_progress, pending, completed, cancelled
              const order: Record<string, number> = {
                [TaskStatus.in_progress]: 1,
                [TaskStatus.pending]: 2,
                [TaskStatus.completed]: 3,
                [TaskStatus.cancelled]: 4,
              };
              return (order[a[0]] || 99) - (order[b[0]] || 99);
            })) {
              const statusConfig = statusConfigMap[status as TaskStatus];
              
              for (const task of statusTasks) {
                if (fieldCount >= maxFieldsPerEmbed) {
                  // Start a new embed
                  embeds.push(currentEmbed);
                  currentEmbed = {
                    title: '📋 Task List (Continued)',
                    color: 0x5865f2,
                    fields: [],
                    timestamp: new Date().toISOString(),
                  };
                  fieldCount = 0;
                }

                const priorityConfig = priorityConfigMap[task.priority as keyof typeof priorityConfigMap];
                
                let taskValue = `${priorityConfig.emoji} **${priorityConfig.name}** Priority\n`;
                taskValue += `👤 Assigned to: <@${task.assignedToUserId}>\n`;
                if (task.description) {
                  const desc = task.description.length > 150 
                    ? task.description.substring(0, 147) + '...' 
                    : task.description;
                  taskValue += `📝 ${desc}\n`;
                }
                if (task.deadline) {
                  const deadlineDate = new Date(task.deadline);
                  const now = new Date();
                  const isOverdue = deadlineDate < now;
                  const deadlineTimestamp = Math.floor(deadlineDate.getTime() / 1000);
                  taskValue += `⏰ Deadline: <t:${deadlineTimestamp}:F>${isOverdue ? ' 🔴 **OVERDUE**' : ''}\n`;
                }
                taskValue += `🆔 ID: \`${task.id.slice(0, 8)}\``;

                currentEmbed.fields.push({
                  name: `${statusConfig.emoji} ${task.title}`,
                  value: taskValue,
                  inline: false,
                });

                fieldCount++;
              }
            }

            // Add the last embed if it has fields
            if (currentEmbed.fields.length > 0) {
              embeds.push(currentEmbed);
            }

            // Add footer to last embed
            if (embeds.length > 0) {
              embeds[embeds.length - 1].footer = {
                text: userOption 
                  ? `Tasks for ${userOption.username}` 
                  : statusOption 
                    ? `Tasks with status: ${statusConfigMap[statusOption as TaskStatus]?.name || statusOption}`
                    : 'All active tasks',
              };
            }

            await interaction.editReply({
              embeds: embeds,
            });
          } catch (error: any) {
            console.error('Error listing tasks:', error);
            await interaction.editReply({
              embeds: [
                {
                  title: '❌ Error',
                  description: `Failed to list tasks: ${error.message || 'Unknown error'}`,
                  color: 0xff0000,
                },
              ],
            });
          }
          return;
        }
      }
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while processing your request. Please try again later.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {
        // Ignore reply errors
      });
    }
  }
});

function getIsoWeekday(isoDate: string): number {
  // Returns 1..7 (Mon..Sun)
  const [y, m, d] = isoDate.split('-').map((x) => Number(x));
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0..6 (Sun..Sat)
  return dow === 0 ? 7 : dow;
}

function getWeekStartMondayIso(isoDate: string): string {
  const weekday = getIsoWeekday(isoDate); // 1..7
  return addDaysIso(isoDate, -(weekday - 1));
}

function dayKeyToIndex(dayKey: string): number | null {
  const map: Record<string, number> = {
    mon: 0,
    tue: 1,
    wed: 2,
    thu: 3,
    fri: 4,
    sat: 5,
    sun: 6,
  };
  return map[dayKey] ?? null;
}

function renderRotaSummary(input: {
  weekStartDate: string;
  weekEndDate: string;
  schedule: any;
}): string {
  const days = Array.isArray(input.schedule?.days) ? input.schedule.days : [];
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  if (days.length !== 7) {
    return `Week: **${input.weekStartDate} → ${input.weekEndDate}**\n(Invalid rota format stored. Please re-submit using /rota.)`;
  }

  const lines = days.map((d: any, i: number) => {
    const status = String(d?.status || '').toLowerCase() === 'holiday' ? 'Holiday' : 'Working';
    const date = d?.date ? ` (${d.date})` : '';
    return `- **${labels[i]}**${date}: ${status}`;
  });

  return [`Week: **${input.weekStartDate} → ${input.weekEndDate}**`, ...lines].join('\n');
}

function createRotaEmbed(input: {
  weekStartDate: string;
  weekEndDate: string;
  schedule: any;
  title?: string;
  isSaved?: boolean;
}) {
  const days = Array.isArray(input.schedule?.days) ? input.schedule.days : [];
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  if (days.length !== 7) {
    return {
      title: input.title || '📋 Rota Summary',
      description: `**Week:** ${input.weekStartDate} → ${input.weekEndDate}\n\n⚠️ Invalid rota format stored. Please re-submit using \`/rota\`.`,
      color: 0xf59e0b,
    };
  }

  const fields = days.map((d: any, i: number) => {
    const status = String(d?.status || '').toLowerCase() === 'holiday' ? '🏖️ Holiday' : '✅ Working';
    const date = d?.date || '';
    return {
      name: `${labels[i]}${date ? ` (${date})` : ''}`,
      value: status,
      inline: true,
    };
  });

  return {
    title: input.title || (input.isSaved ? '✅ Rota Saved' : '📋 Your Rota'),
    description: `**Week:** ${input.weekStartDate} → ${input.weekEndDate} (UK week)`,
    fields,
    color: input.isSaved ? 0x22c55e : 0x3b82f6,
    timestamp: new Date().toISOString(),
  };
}

// Handle task button clicks
async function handleTaskButton(interaction: any, taskId: string, newStatus: TaskStatus) {
  try {
    if (!interaction.guild || !interaction.channel) {
      await interaction.reply({ 
        content: 'This can only be used in a server channel.', 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      await interaction.reply({ 
        content: 'Task not found.', 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    // Check if user is assigned to this task or is staff
    const isAssigned = task.assignedToUserId === interaction.user.id;
    const staffIds = new Set(getStaffUserIds(env));
    const isStaffUser = staffIds.has(interaction.user.id);

    if (!isAssigned && !isStaffUser) {
      await interaction.reply({ 
        content: 'You can only update tasks assigned to you, or you must be staff.', 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    await updateTaskStatus(task.id, newStatus, interaction.user.id);

    // Update the message with new status
    const statusEmoji = {
      [TaskStatus.pending]: '⚪',
      [TaskStatus.in_progress]: '🟡',
      [TaskStatus.completed]: '✅',
      [TaskStatus.cancelled]: '❌',
    }[newStatus];

    const statusText = newStatus === TaskStatus.in_progress ? 'In Progress' : 
                      newStatus === TaskStatus.completed ? 'Completed' : 
                      newStatus === TaskStatus.cancelled ? 'Cancelled' : 'Pending';

    await interaction.reply({
      content: `${statusEmoji} **Task status updated to ${statusText}**`,
      flags: MessageFlags.Ephemeral,
    });

    // Also send update message in channel
    await interaction.channel.send({
      content: `<@${task.assignedToUserId}> ${statusEmoji} **Task Status Updated**`,
      embeds: [
        {
          title: task.title,
          description: `Status changed to: **${statusText}**`,
          color: newStatus === TaskStatus.completed ? 0x00ff00 : newStatus === TaskStatus.cancelled ? 0xff0000 : 0xff8800,
          footer: {
            text: `Updated by: ${interaction.user.username}`,
          },
        },
      ],
    });

    // Update the original message to remove buttons if completed/cancelled
    if (newStatus === TaskStatus.completed || newStatus === TaskStatus.cancelled) {
      try {
        const message = await interaction.message.fetch();
        await message.edit({
          components: [], // Remove buttons
        });
      } catch (error) {
        // Message might not be available, ignore
      }
    }
  } catch (error: any) {
    console.error('Error handling task button:', error);
    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.reply({
        content: 'An error occurred while updating the task.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  }
}

// Handle task complete button - tell user to upload proof in chat
async function handleTaskCompleteButton(interaction: any, taskId: string) {
  try {
    if (!interaction.guild || !interaction.channel) {
      await interaction.reply({ 
        content: 'This can only be used in a server channel.', 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      await interaction.reply({ 
        content: 'Task not found.', 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    // Check if task is already completed or cancelled
    if (task.status === TaskStatus.completed) {
      await interaction.reply({ 
        content: '✅ This task is already completed.', 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    if (task.status === TaskStatus.cancelled) {
      await interaction.reply({ 
        content: '❌ This task has been cancelled.', 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    // Check if user is assigned to this task or is staff
    const isAssigned = task.assignedToUserId === interaction.user.id;
    const staffIds = new Set(getStaffUserIds(env));
    const isStaffUser = staffIds.has(interaction.user.id);

    if (!isAssigned && !isStaffUser) {
      await interaction.reply({ 
        content: 'You can only complete tasks assigned to you, or you must be staff.', 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    // Tell user to upload proof image in chat
    await interaction.reply({
      content: `**To complete this task, please post your proof here in this channel.**\n\nUpload an image (as an attachment) showing that you have completed the task. Once you post the proof image, the task will be automatically marked as completed.`,
      flags: MessageFlags.Ephemeral,
    });

    // Also send a message in the channel
    await interaction.channel.send({
      content: `<@${task.assignedToUserId}>`,
      embeds: [
        {
          title: 'Task Completion Required',
          description: `**Please post your proof here to complete this task.**\n\nUpload an image showing that you have completed: **${task.title}**\n\nOnce you post the proof image in this channel, the task will be automatically marked as completed.`,
          color: 0x5865f2,
          footer: {
            text: `Task ID: ${task.id.slice(0, 8)}`,
          },
        },
      ],
    });
  } catch (error: any) {
    console.error('Error handling complete button:', error);
    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.reply({
        content: 'An error occurred. Please try again.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('SIGINT', async () => {
  await client.destroy();
  process.exit(0);
});

await client.login(env.DISCORD_BOT_TOKEN);
