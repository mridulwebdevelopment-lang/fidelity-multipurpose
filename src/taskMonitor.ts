import type { Client, TextChannel } from 'discord.js';
import { prisma, TaskStatus } from './db/index.js';
import { getEnv, getStaffUserIds } from './env.js';

const REMIND_INTERVAL_HOURS = 12; // Remind if not updated for 12 hours
const ESCALATE_AFTER_REMINDERS = 2; // Escalate after 2 reminders

export function startTaskMonitor(client: Client) {
  // Check every hour
  setInterval(async () => {
    try {
      await checkAndRemindTasks(client);
    } catch (error) {
      console.error('Error in task monitor:', error);
    }
  }, 60 * 60 * 1000);

  // Also run immediately
  checkAndRemindTasks(client).catch((error) => {
    console.error('Error in initial task monitor run:', error);
  });
}

async function checkAndRemindTasks(client: Client) {
  const env = getEnv();
  
  // Get all pending and in_progress tasks
  const allTasks = await prisma.task.findMany({});
  const tasks = allTasks.filter(
    (t) => t.status === TaskStatus.pending || t.status === TaskStatus.in_progress
  );

  const now = new Date();
  const remindThreshold = new Date(now.getTime() - REMIND_INTERVAL_HOURS * 60 * 60 * 1000);

  for (const task of tasks) {
    const lastUpdate = task.lastRemindedAt ? new Date(task.lastRemindedAt) : new Date(task.createdAt);
    const needsReminder = lastUpdate < remindThreshold;

    if (needsReminder) {
      // Check if task is overdue
      const isOverdue = task.deadline && new Date(task.deadline) < now;

      // Update last reminded time
      await prisma.task.update({
        where: { id: task.id },
        data: {
          lastRemindedAt: now.toISOString(),
          escalationCount: task.escalationCount + 1,
        },
      });

      // Get channel
      try {
        const channel = await client.channels.fetch(task.channelId);
        if (channel && channel.isTextBased()) {
          const textChannel = channel as TextChannel;
          
          // Check if we should escalate
          if (task.escalationCount + 1 >= ESCALATE_AFTER_REMINDERS) {
            await escalateTask(client, task, textChannel, isOverdue);
          } else {
            await remindTask(client, task, textChannel, isOverdue);
          }
        }
      } catch (error) {
        console.error(`Error fetching channel for task ${task.id}:`, error);
      }

      // Try to send DM
      try {
        const user = await client.users.fetch(task.assignedToUserId);
        const dmChannel = await user.createDM();
        await dmChannel.send({
          content: `⏰ **Task Reminder**\n\nYou have a task that needs attention: **${task.title}**\n\nView in: <#${task.channelId}>${isOverdue ? '\n\n⚠️ **This task is overdue!**' : ''}`,
        });
      } catch (error) {
        console.error(`Error sending DM for task ${task.id}:`, error);
      }
    }
  }
}

async function remindTask(client: Client, task: any, channel: TextChannel, isOverdue: boolean) {
  const hoursSinceUpdate = task.lastRemindedAt 
    ? Math.floor((Date.now() - new Date(task.lastRemindedAt).getTime()) / (1000 * 60 * 60))
    : Math.floor((Date.now() - new Date(task.createdAt).getTime()) / (1000 * 60 * 60));

  await channel.send({
    content: `<@${task.assignedToUserId}> ⏰ **Task Reminder**`,
    embeds: [
      {
        title: task.title,
        description: `This task hasn't been updated in ${hoursSinceUpdate} hours.${isOverdue ? '\n\n⚠️ **This task is overdue!**' : ''}`,
        color: isOverdue ? 0xff0000 : 0xff8800,
        fields: [
          {
            name: 'Status',
            value: task.status.charAt(0).toUpperCase() + task.status.slice(1).replace('_', ' '),
            inline: true,
          },
          {
            name: 'Priority',
            value: task.priority.charAt(0).toUpperCase() + task.priority.slice(1),
            inline: true,
          },
        ],
        footer: {
          text: `Task ID: ${task.id.slice(0, 8)}`,
        },
      },
    ],
  });
}

async function escalateTask(client: Client, task: any, channel: TextChannel, isOverdue: boolean) {
  const env = getEnv();
  
  // Send to red-alerts channel
  try {
    const redAlertsChannel = await client.channels.fetch(env.RED_ALERTS_CHANNEL_ID);
    if (redAlertsChannel && redAlertsChannel.isTextBased()) {
      // Ping Kash and Ryan specifically
      const kashMention = `<@${env.KASH_USER_ID}>`;
      const ryanMention = `<@${env.RYAN_USER_ID}>`;
      
      await (redAlertsChannel as TextChannel).send({
        content: `${kashMention} ${ryanMention} **TASK ESCALATION - ACTION REQUIRED**`,
        embeds: [
          {
            title: `${task.title}`,
            description: task.description || 'No description provided',
            color: 0xff0000,
            fields: [
              {
                name: 'Assigned To',
                value: `<@${task.assignedToUserId}>`,
                inline: true,
              },
              {
                name: 'Status',
                value: task.status.charAt(0).toUpperCase() + task.status.slice(1).replace('_', ' '),
                inline: true,
              },
              {
                name: 'Priority',
                value: task.priority.charAt(0).toUpperCase() + task.priority.slice(1),
                inline: true,
              },
              {
                name: 'Reminders Sent',
                value: `${task.escalationCount + 1}`,
                inline: true,
              },
              {
                name: 'Task Status',
                value: isOverdue ? '⚠️ **OVERDUE**' : '⚠️ **NOT COMPLETED**',
                inline: true,
              },
            ],
            footer: {
              text: `Task Channel: <#${task.channelId}> | Task ID: ${task.id.slice(0, 8)}`,
            },
            timestamp: task.deadline ? new Date(task.deadline).toISOString() : undefined,
          },
        ],
      });
    }
  } catch (error) {
    console.error('Error sending escalation to red-alerts:', error);
  }

  // Also notify in the task channel
  await channel.send({
    content: `<@${task.assignedToUserId}> **TASK ESCALATED TO RED ALERTS**`,
    embeds: [
      {
        title: task.title,
        description: `This task has been escalated to <#${env.RED_ALERTS_CHANNEL_ID}> due to lack of updates. ${isOverdue ? 'This task is overdue!' : 'Please complete this task as soon as possible.'}`,
        color: 0xff0000,
      },
    ],
  });
}
