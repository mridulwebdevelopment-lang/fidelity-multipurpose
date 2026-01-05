import { REST, Routes } from 'discord.js';
import { ALL_COMMANDS } from '../commands.js';
import { getEnv } from '../env.js';

export async function registerCommands(env: ReturnType<typeof getEnv>) {
  const rest = new REST().setToken(env.DISCORD_BOT_TOKEN);

  try {
    console.log('Started refreshing application (/) commands.');
    console.log(`Registering ${ALL_COMMANDS.length} commands:`, ALL_COMMANDS.map(c => c.name).join(', '));
    console.log('Command details:', JSON.stringify(ALL_COMMANDS.map(c => ({ name: c.name, description: c.description })), null, 2));

    const route = env.DISCORD_DEV_GUILD_ID
      ? Routes.applicationGuildCommands(env.DISCORD_APPLICATION_ID, env.DISCORD_DEV_GUILD_ID)
      : Routes.applicationCommands(env.DISCORD_APPLICATION_ID);

    console.log(`Using route: ${env.DISCORD_DEV_GUILD_ID ? 'Guild (instant)' : 'Global (may take up to 1 hour)'}`);

    const result = await rest.put(route, { body: ALL_COMMANDS }) as any[];

    console.log('Successfully reloaded application (/) commands.');
    console.log(`Discord confirmed ${result.length} commands registered:`, result.map((c: any) => `/${c.name}`).join(', '));
    console.log('All registered commands:', ALL_COMMANDS.map(c => `/${c.name}`).join(', '));
  } catch (error) {
    console.error('Error registering commands:', error);
    throw error;
  }
}



