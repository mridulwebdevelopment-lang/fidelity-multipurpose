import { REST, Routes } from 'discord.js';
import { ALL_COMMANDS } from '../commands.js';
import { getEnv } from '../env.js';

export async function registerCommands(env: ReturnType<typeof getEnv>) {
  const rest = new REST().setToken(env.DISCORD_BOT_TOKEN);

  try {
    console.log('Started refreshing application (/) commands.');

    const route = env.DISCORD_DEV_GUILD_ID
      ? Routes.applicationGuildCommands(env.DISCORD_APPLICATION_ID, env.DISCORD_DEV_GUILD_ID)
      : Routes.applicationCommands(env.DISCORD_APPLICATION_ID);

    await rest.put(route, { body: ALL_COMMANDS });

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error registering commands:', error);
    throw error;
  }
}



