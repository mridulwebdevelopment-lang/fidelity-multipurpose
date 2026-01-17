import type { Guild, TextChannel, User } from 'discord.js';
import { GuildMember, PermissionFlagsBits } from 'discord.js';
import { prisma, TaskStatus, TaskPriority } from './db/index.js';
import { getEnv, getStaffRoleIds, getStaffUserIds } from './env.js';
import { parseDeadline } from './utils.js';

export async function assignTask(
  env: ReturnType<typeof getEnv>,
  guild: Guild,
  assignedTo: GuildMember | User,
  assignedBy: User,
  title: string,
  description?: string | null,
  priority?: string | null,
  deadlineStr?: string | null,
): Promise<{ channel: TextChannel; task: any }> {
  // Parse deadline
  const deadline = deadlineStr ? parseDeadline(deadlineStr) : null;

  // Get or create channel for the user
  const channel = await getOrCreateUserChannel(env, guild, assignedTo);

  // Create task in database
  const task = await prisma.task.create({
    data: {
      title,
      description: description || null,
      assignedToUserId: assignedTo.id,
      assignedByUserId: assignedBy.id,
      status: TaskStatus.pending,
      priority: (priority as TaskPriority) || TaskPriority.medium,
      deadline: deadline ? deadline.toISOString() : null,
      channelId: channel.id,
    },
  });

  // Priority configuration
  const priorityConfigMap = {
    [TaskPriority.low]: { emoji: '🟢', color: 0x22c55e, name: 'Low' },
    [TaskPriority.medium]: { emoji: '🟡', color: 0xeab308, name: 'Medium' },
    [TaskPriority.high]: { emoji: '🟠', color: 0xf97316, name: 'High' },
    [TaskPriority.urgent]: { emoji: '🔴', color: 0xef4444, name: 'Urgent' },
  };
  const priorityConfig = priorityConfigMap[task.priority as TaskPriority];

  // Send notification in channel with action buttons
  await channel.send({
    content: `<@${assignedTo.id}> 📋 **New Task Assigned**`,
    embeds: [
      {
        title: `${priorityConfig.emoji} ${task.title}`,
        description: task.description 
          ? `\n${task.description}\n` 
          : '\n*No description provided*\n',
        color: priorityConfig.color,
        thumbnail: {
          url: ('displayAvatarURL' in assignedTo 
            ? (assignedTo as GuildMember).displayAvatarURL({ size: 128 })
            : (assignedTo as User).avatarURL({ size: 128 })) || undefined,
        },
        fields: [
          {
            name: '📊 Priority Level',
            value: `**${priorityConfig.emoji} ${priorityConfig.name}**`,
            inline: true,
          },
          {
            name: '📝 Status',
            value: '**⚪ Pending**',
            inline: true,
          },
          {
            name: '👤 Assigned By',
            value: `<@${assignedBy.id}>`,
            inline: true,
          },
          ...(deadline
            ? [
                {
                  name: '⏰ Deadline',
                  value: `<t:${Math.floor(deadline.getTime() / 1000)}:F>\n<t:${Math.floor(deadline.getTime() / 1000)}:R>`,
                  inline: false,
                },
              ]
            : [
                {
                  name: '⏰ Deadline',
                  value: '*No deadline set*',
                  inline: false,
                },
              ]),
        ],
        footer: {
          text: `Task ID: ${task.id.slice(0, 8)} • Created`,
          icon_url: assignedBy.displayAvatarURL({ size: 64 }) || undefined,
        },
        timestamp: new Date().toISOString(),
      },
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 1, // Primary button
            custom_id: `task_start_${task.id}`,
            label: 'Start Task',
          },
          {
            type: 2,
            style: 3, // Success button
            custom_id: `task_complete_${task.id}`,
            label: 'Complete',
          },
        ],
      },
    ],
  });

  // Send DM to user
  try {
    const dmChannel = await assignedTo.createDM();
    const priorityConfigMap = {
      [TaskPriority.low]: { emoji: '🟢', color: 0x22c55e, name: 'Low' },
      [TaskPriority.medium]: { emoji: '🟡', color: 0xeab308, name: 'Medium' },
      [TaskPriority.high]: { emoji: '🟠', color: 0xf97316, name: 'High' },
      [TaskPriority.urgent]: { emoji: '🔴', color: 0xef4444, name: 'Urgent' },
    };
    const priorityConfig = priorityConfigMap[task.priority as TaskPriority];

    await dmChannel.send({
      content: `📋 **New Task Assigned to You**`,
      embeds: [
        {
          title: `${priorityConfig.emoji} ${task.title}`,
          description: task.description 
            ? `\n${task.description}\n` 
            : '\n*No description provided*\n',
          color: priorityConfig.color,
          thumbnail: {
            url: assignedBy.displayAvatarURL({ size: 128 }) || undefined,
          },
          fields: [
            {
              name: '📊 Priority Level',
              value: `**${priorityConfig.emoji} ${priorityConfig.name}**`,
              inline: true,
            },
            {
              name: '📝 Status',
              value: '**⚪ Pending**',
              inline: true,
            },
            {
              name: '👤 Assigned By',
              value: `<@${assignedBy.id}>`,
              inline: true,
            },
            ...(deadline
              ? [
                  {
                    name: '⏰ Deadline',
                    value: `<t:${Math.floor(deadline.getTime() / 1000)}:F>\n<t:${Math.floor(deadline.getTime() / 1000)}:R>`,
                    inline: false,
                  },
                ]
              : [
                  {
                    name: '⏰ Deadline',
                    value: '*No deadline set*',
                    inline: false,
                  },
                ]),
            {
              name: '💬 Task Channel',
              value: `<#${channel.id}>`,
              inline: false,
            },
          ],
          footer: {
            text: `Task ID: ${task.id.slice(0, 8)} • View task channel to interact`,
          },
          timestamp: new Date().toISOString(),
        },
      ],
    });
  } catch (error) {
    console.error('Failed to send DM:', error);
    // DM failed, but continue - channel notification was sent
  }

  return { channel, task };
}

export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  userId: string,
): Promise<any> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error('Task not found');

  await prisma.task.update({
    where: { id: taskId },
    data: { status },
  });

  return { ...task, status };
}

export async function getOrCreateUserChannel(
  env: ReturnType<typeof getEnv>,
  guild: Guild,
  user: GuildMember | User,
): Promise<TextChannel> {
  // Get the category first
  const category = await guild.channels.fetch(env.TASKS_CATEGORY_ID);
  if (!category || !('children' in category)) {
    throw new Error('Tasks category not found');
  }

  // Get username - check if it's a GuildMember (has displayName) or User (has username)
  const username = ('displayName' in user && user.displayName) ? user.displayName : user.username;
  const channelName = `task-${username.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

  // First, check if a channel with this name already exists in the category
  const categoryChannels = category.children.cache;
  const existingChannel = categoryChannels.find(
    (ch: any) => ch.name === channelName && ch.isTextBased()
  ) as TextChannel | undefined;

  if (existingChannel) {
    // Channel already exists, return it without sending welcome message
    return existingChannel;
  }

  // Check database for existing channel ID (in case channel name changed)
  const existingTasks = await prisma.task.findMany({
    where: { assignedToUserId: user.id },
    take: 1,
  });

  if (existingTasks.length > 0 && existingTasks[0].channelId) {
    try {
      const dbChannel = await guild.channels.fetch(existingTasks[0].channelId);
      if (dbChannel && dbChannel.isTextBased() && dbChannel.parentId === category.id) {
        return dbChannel as TextChannel;
      }
    } catch (error) {
      // Channel doesn't exist, will create new one
    }
  }

  // Channel doesn't exist, create new one
  const botMember = await guild.members.fetchMe();
  const staffRoleIds = getStaffRoleIds(env);
  const staffUserIds = getStaffUserIds(env);

  // Build permission overwrites
  const permissionOverwrites: any[] = [
    {
      id: guild.id, // @everyone role - deny all
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: botMember.id, // Bot - allow all to manage channel
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    {
      id: user.id, // Assigned user - allow to view and send messages
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  // Add staff role permissions (admins can see all channels)
  for (const roleId of staffRoleIds) {
    try {
      const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId));
      if (role) {
        permissionOverwrites.push({
          id: role,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageMessages,
          ],
        });
      }
    } catch (error) {
      // Role not found, skip it
      console.warn(`Staff role ${roleId} not found in guild, skipping`);
    }
  }

  // Add individual staff user permissions (for staff user IDs)
  for (const userId of staffUserIds) {
    // Don't add permission overwrite for the task owner (already added above)
    if (userId !== user.id) {
      try {
        // Verify the user is in the guild before adding permission overwrite
        const staffMember = await guild.members.fetch(userId).catch(() => null);
        if (staffMember) {
          permissionOverwrites.push({
            id: userId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          });
        }
      } catch (error) {
        // User not in guild, skip them
        console.warn(`Staff user ${userId} not found in guild, skipping permission overwrite`);
      }
    }
  }

  const channel = await guild.channels.create({
    name: channelName,
    type: 0, // TextChannel
    parent: category.id,
    permissionOverwrites,
  });

  // Only send welcome message when channel is actually created
  await channel.send({
    content: `<@${user.id}>`,
    embeds: [
      {
        title: '✨ Task Channel Ready',
        description: 'This is your personal task channel. All tasks assigned to you will be posted here, and you\'ll receive DM notifications as well.',
        color: 0x5865f2,
        thumbnail: {
          url: ('displayAvatarURL' in user && user.displayAvatarURL) 
            ? user.displayAvatarURL({ size: 128 }) 
            : ('avatarURL' in user ? user.avatarURL({ size: 128 }) : undefined) || undefined,
        },
        footer: {
          text: 'Task Management System',
        },
        timestamp: new Date().toISOString(),
      },
    ],
  });

  return channel as TextChannel;
}

export async function findTaskByChannel(channelId: string): Promise<any | null> {
  return await prisma.task.findUnique({ where: { channelId } });
}

export async function findLatestActiveTaskByChannel(channelId: string): Promise<any | null> {
  const allTasks = await prisma.task.findMany({
    orderBy: { createdAt: 'desc' },
  });
  
  // Filter tasks for this channel and find the most recent pending or in_progress task
  const channelTasks = allTasks.filter((task: any) => task.channelId === channelId);
  const activeTask = channelTasks.find(
    (task: any) => task.status === TaskStatus.pending || task.status === TaskStatus.in_progress
  );
  
  return activeTask || null;
}
