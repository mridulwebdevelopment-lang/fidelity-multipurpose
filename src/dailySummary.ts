import type { Client, TextChannel } from 'discord.js';
import { prisma, TaskStatus } from './db/index.js';
import { getEnv, getStaffUserIds } from './env.js';

export function startDailySummary(client: Client) {
  // Calculate time until next midnight (12 AM) UK time
  // UK timezone is Europe/London (GMT/BST)
  const calculateNextMidnightUK = (): Date => {
    const now = new Date();
    
    // Get current time in UK timezone
    const ukNowStr = now.toLocaleString('en-GB', { 
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    const [datePart, timePart] = ukNowStr.split(', ');
    const [day, month, year] = datePart.split('/').map(Number);
    const [hour] = timePart.split(':').map(Number);
    
    // Target date for next midnight (tomorrow if current hour >= 0)
    let targetDay = day;
    let targetMonth = month;
    let targetYear = year;
    
    if (hour >= 0) {
      targetDay++;
      // Handle month/year overflow
      const daysInMonth = new Date(year, month, 0).getDate();
      if (targetDay > daysInMonth) {
        targetDay = 1;
        targetMonth++;
        if (targetMonth > 12) {
          targetMonth = 1;
          targetYear++;
        }
      }
    }
    
    // Find UTC time that corresponds to midnight UK on target date
    // UK is either UTC+0 (GMT) or UTC+1 (BST), so test times around midnight UTC
    // Start testing from 23:00 UTC the previous day to 01:00 UTC on target day
    let testStartDay = targetDay - 1;
    let testStartMonth = targetMonth - 1;
    let testStartYear = targetYear;
    
    if (testStartDay < 1) {
      testStartMonth--;
      if (testStartMonth < 1) {
        testStartMonth = 12;
        testStartYear--;
      }
      testStartDay = new Date(testStartYear, testStartMonth, 0).getDate();
    }
    
    const testStart = new Date(Date.UTC(testStartYear, testStartMonth - 1, testStartDay, 23, 0, 0, 0));
    
    // Test 4 hours worth (covers UTC-1 to UTC+2, more than enough)
    for (let offset = 0; offset < 4; offset++) {
      const testUTC = new Date(testStart);
      testUTC.setUTCHours(testUTC.getUTCHours() + offset);
      
      const testUKStr = testUTC.toLocaleString('en-GB', { 
        timeZone: 'Europe/London',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      
      const [testDatePart, testTimePart] = testUKStr.split(', ');
      const [testDay, testMonth, testYear] = testDatePart.split('/').map(Number);
      const [testHour] = testTimePart.split(':').map(Number);
      
      // Check if this UTC time is midnight UK on the target date
      if (testHour === 0 && testDay === targetDay && testMonth === targetMonth && testYear === targetYear) {
        if (testUTC > now) {
          return testUTC;
        }
      }
    }
    
    // Fallback: schedule for 24 hours from now (shouldn't reach here)
    const fallback = new Date(now);
    fallback.setTime(now.getTime() + 24 * 60 * 60 * 1000);
    return fallback;
  };

  const nextMidnight = calculateNextMidnightUK();
  const msUntilMidnight = nextMidnight.getTime() - new Date().getTime();

  console.log(`📅 Daily summary scheduled for: ${nextMidnight.toISOString()}`);
  console.log(`   (${Math.round(msUntilMidnight / 1000 / 60)} minutes from now)`);

  // Schedule first run
  setTimeout(() => {
    sendDailySummary(client);
    // Then run every 24 hours
    setInterval(() => {
      sendDailySummary(client);
    }, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
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
