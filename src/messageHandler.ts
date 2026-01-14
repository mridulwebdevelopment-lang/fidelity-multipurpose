import type { Message, TextChannel } from 'discord.js';
import { prisma, TaskStatus } from './db/index.js';
import { findLatestActiveTaskByChannel } from './tasks.js';

export async function handleTaskChannelMessage(message: Message) {
  // Ignore bot messages
  if (message.author.bot) return;
  
  // Only handle messages in channels (not DMs)
  if (!message.guild || !message.channel.isTextBased()) return;

  try {
    // Find the latest active task for this channel
    const task = await findLatestActiveTaskByChannel(message.channel.id);
    if (!task) return; // No active task in this channel

    // Check if user is assigned to this task
    if (task.assignedToUserId !== message.author.id) return;

    // Check if message has image attachments or image URLs
    const imageAttachments = message.attachments.filter(
      (attachment) => 
        attachment.contentType?.startsWith('image/') ||
        attachment.name?.match(/\.(png|jpg|jpeg|gif|webp)$/i)
    );

    let imageUrl: string | null = null;

    // Check for image attachments first
    if (imageAttachments.size > 0) {
      imageUrl = imageAttachments.first()?.url || null;
    } else {
      // Check if message contains image URLs (Discord CDN URLs)
      const urlPattern = /https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp)(\?[^\s]*)?/i;
      const urlMatch = message.content.match(urlPattern);
      if (urlMatch) {
        imageUrl = urlMatch[0];
      }
    }

    if (imageUrl && (task.status === TaskStatus.in_progress || task.status === TaskStatus.pending)) {
      try {
        // Re-fetch task to ensure it hasn't been completed already (safety check)
        const currentTask = await prisma.task.findUnique({ where: { id: task.id } });
        if (!currentTask) {
          console.log(`Task ${task.id} not found when trying to complete`);
          return;
        }
        
        // Skip if task is already completed or cancelled
        if (currentTask.status === TaskStatus.completed || currentTask.status === TaskStatus.cancelled) {
          console.log(`Task ${task.id} is already ${currentTask.status}, skipping completion`);
          await message.react('ℹ️');
          return;
        }
        
        // Update task with proof image and mark as completed
        await prisma.task.update({
          where: { id: currentTask.id },
          data: {
            status: TaskStatus.completed,
            proofImageUrl: imageUrl,
          },
        });

        // Send completion confirmation
        await message.react('✅');

        // Send completion message in channel with proof
        await message.channel.send({
          content: `<@${currentTask.assignedToUserId}> ✅ **Task Completed**`,
          embeds: [
            {
              title: currentTask.title,
              description: 'Task has been marked as completed with proof image.',
              color: 0x22c55e,
              image: {
                url: imageUrl,
              },
              footer: {
                text: `Completed by: ${message.author.username}`,
              },
              timestamp: new Date().toISOString(),
            },
          ],
        });

        // Update the original task message to remove buttons if we can find it
        try {
          const channel = message.channel as TextChannel;
          const messages = await channel.messages.fetch({ limit: 50 });
          const taskMessage = messages.find((msg) => {
            // Look for the task message by checking embeds for task ID
            return msg.embeds.some((embed) => 
              embed.footer?.text?.includes(currentTask.id.slice(0, 8))
            );
          });
          
          if (taskMessage && taskMessage.components.length > 0) {
            await taskMessage.edit({
              components: [], // Remove buttons
            });
          }
        } catch (error) {
          // Message might not be available, ignore
          console.error('Error updating task message:', error);
        }
      } catch (updateError: any) {
        console.error('Error updating task with proof image:', updateError);
        // Try to notify user about the error
        try {
          await message.react('❌');
          await message.channel.send({
            content: `<@${message.author.id}> ⚠️ Failed to update task. Error: ${updateError.message || 'Unknown error'}`,
          });
        } catch (notifyError) {
          // If notification fails, just log it
          console.error('Error notifying user about update failure:', notifyError);
        }
      }
    } else if (imageUrl) {
      // Image was uploaded but task is not in a valid state
      console.log(`Image uploaded for task ${task.id} but task status is ${task.status}, not updating`);
    }
  } catch (error) {
    console.error('Error handling task channel message:', error);
  }
}
