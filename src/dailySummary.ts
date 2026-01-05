import type { Client, TextChannel } from 'discord.js';
import { prisma, TaskStatus } from './db/index.js';
import { getEnv, getStaffUserIds } from './env.js';

export function startDailySummary(client: Client) {
  // Calculate time until next 9 AM
  const now = new Date();
  const next9AM = new Date(now);
  next9AM.setHours(9, 0, 0, 0);
  if (next9AM <= now) {
    next9AM.setDate(next9AM.getDate() + 1);
  }

  const msUntil9AM = next9AM.getTime() - now.getTime();

  // Schedule first run
  setTimeout(() => {
    sendDailySummary(client);
    // Then run every 24 hours
    setInterval(() => {
      sendDailySummary(client);
    }, 24 * 60 * 60 * 1000);
  }, msUntil9AM);
}

async function sendDailySummary(client: Client) {
  const env = getEnv();

  try {
    // Get all pending and in_progress tasks
    const allTasks = await prisma.task.findMany({});
    const tasks = allTasks.filter(
      (t) => t.status === TaskStatus.pending || t.status === TaskStatus.in_progress
    );

    if (tasks.length === 0) {
      return; // No tasks to report
    }

    // Group tasks by assigned user
    const tasksByUser = new Map<string, any[]>();
    for (const task of tasks) {
      if (!tasksByUser.has(task.assignedToUserId)) {
        tasksByUser.set(task.assignedToUserId, []);
      }
      tasksByUser.get(task.assignedToUserId)!.push(task);
    }

    // Create summary message
    const now = new Date();
    const overdueTasks: any[] = [];
    const upcomingTasks: any[] = [];

    for (const task of tasks) {
      if (task.deadline) {
        const deadline = new Date(task.deadline);
        if (deadline < now) {
          overdueTasks.push(task);
        } else if (deadline.getTime() - now.getTime() < 24 * 60 * 60 * 1000) {
          // Due within 24 hours
          upcomingTasks.push(task);
        }
      }
    }

    // Format summary with larger, more readable text
    const summaryLines: string[] = [];
    summaryLines.push('**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**');
    summaryLines.push(`**📋 DAILY TASK SUMMARY**`);
    summaryLines.push(`**Generated:** <t:${Math.floor(Date.now() / 1000)}:F>\n`);

    if (overdueTasks.length > 0) {
      summaryLines.push('**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**');
      summaryLines.push(`**🔴 OVERDUE TASKS (${overdueTasks.length})**\n`);
      for (const task of overdueTasks) {
        summaryLines.push(`**⚠️ ${task.title}**`);
        summaryLines.push(`   👤 Assigned To: <@${task.assignedToUserId}>`);
        summaryLines.push(`   🔴 Status: OVERDUE`);
        if (task.deadline) {
          summaryLines.push(`   ⏰ Deadline: <t:${Math.floor(new Date(task.deadline).getTime() / 1000)}:F>`);
        }
        summaryLines.push('');
      }
    }

    if (upcomingTasks.length > 0) {
      summaryLines.push('**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**');
      summaryLines.push(`**⚠️ TASKS DUE TODAY (${upcomingTasks.length})**\n`);
      for (const task of upcomingTasks) {
        summaryLines.push(`**${task.title}**`);
        summaryLines.push(`   👤 Assigned To: <@${task.assignedToUserId}>`);
        if (task.deadline) {
          summaryLines.push(`   ⏰ Deadline: <t:${Math.floor(new Date(task.deadline).getTime() / 1000)}:F>`);
        }
        summaryLines.push('');
      }
    }

    summaryLines.push('**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**');
    summaryLines.push(`**📊 ALL OUTSTANDING TASKS (${tasks.length})**\n`);
    
    for (const [userId, userTasks] of tasksByUser.entries()) {
      summaryLines.push(`**👤 <@${userId}> — ${userTasks.length} TASK(S)**\n`);
      for (const task of userTasks) {
        const statusEmoji = task.status === TaskStatus.in_progress ? '🟡' : '⚪';
        const priorityEmoji = {
          low: '🟢',
          medium: '🟡',
          high: '🟠',
          urgent: '🔴',
        }[task.priority];
        
        summaryLines.push(`${statusEmoji} ${priorityEmoji} **${task.title}**`);
        summaryLines.push(`   📝 Status: ${task.status.toUpperCase().replace('_', ' ')} | Priority: ${task.priority.toUpperCase()}`);
        if (task.deadline) {
          summaryLines.push(`   ⏰ Deadline: <t:${Math.floor(new Date(task.deadline).getTime() / 1000)}:F>`);
        }
        summaryLines.push('');
      }
      summaryLines.push('');
    }
    summaryLines.push('**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**');

    // Send to daily summary channel
    try {
      const channel = await client.channels.fetch(env.DAILY_SUMMARY_CHANNEL_ID);
      if (channel && channel.isTextBased()) {
        const staffUserIds = getStaffUserIds(env);
        const staffMentions = staffUserIds.map(id => `<@${id}>`).join(' ') || '@Staff';
        
        // Split into multiple embeds if needed (Discord has 4096 char limit per embed)
        const description = summaryLines.join('\n');
        const maxLength = 4000;
        
        if (description.length <= maxLength) {
          await (channel as TextChannel).send({
            content: `${staffMentions}`,
            embeds: [
              {
                title: '📋 DAILY TASK SUMMARY',
                description: description,
                color: overdueTasks.length > 0 ? 0xff0000 : 0xff8800,
                timestamp: new Date().toISOString(),
              },
            ],
          });
        } else {
          // Split into multiple messages if too long
          const chunks = [];
          let currentChunk = '';
          for (const line of summaryLines) {
            if (currentChunk.length + line.length + 1 > maxLength) {
              chunks.push(currentChunk);
              currentChunk = line + '\n';
            } else {
              currentChunk += line + '\n';
            }
          }
          if (currentChunk) chunks.push(currentChunk);

          await (channel as TextChannel).send({
            content: `${staffMentions}`,
            embeds: [
              {
                title: '📋 DAILY TASK SUMMARY',
                description: chunks[0],
                color: overdueTasks.length > 0 ? 0xff0000 : 0xff8800,
                timestamp: new Date().toISOString(),
              },
            ],
          });

          // Send remaining chunks
          for (let i = 1; i < chunks.length; i++) {
            await (channel as TextChannel).send({
              embeds: [
                {
                  description: chunks[i],
                  color: overdueTasks.length > 0 ? 0xff0000 : 0xff8800,
                },
              ],
            });
          }
        }
      }
    } catch (error) {
      console.error('Error sending daily summary:', error);
    }
  } catch (error) {
    console.error('Error generating daily summary:', error);
  }
}
