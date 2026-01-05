# Troubleshooting Guide

## Error: "Could not find the table 'public.tasks'"

**Solution**: You need to run the database migration.

1. Go to your Supabase project dashboard
2. Click on "SQL Editor"
3. Run the SQL from `tasks_migration.sql` (in the root folder)
   OR from `supabase_migration.sql` (in the bot folder)
4. Wait for the migration to complete
5. Restart the bot

## Error: "Used disallowed intents"

**Solution**: Enable required intents in Discord Developer Portal.

1. Go to https://discord.com/developers/applications
2. Select your bot application
3. Go to "Bot" section
4. Scroll to "Privileged Gateway Intents"
5. Enable:
   - ✅ **SERVER MEMBERS INTENT**
   - ✅ **MESSAGE CONTENT INTENT**
6. Click "Save Changes"
7. Restart your bot

See `DISCORD_SETUP.md` for detailed instructions.

## Error: "Invalid environment variables"

**Solution**: Check your `.env` file location and format.

1. Make sure `.env` file is in `multipurpose-bot/bot/` folder
2. Make sure all required variables are set:
   ```env
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   DISCORD_BOT_TOKEN=...
   DISCORD_APPLICATION_ID=...
   TASKS_CATEGORY_ID=...
   RED_ALERTS_CHANNEL_ID=...
   STAFF_USER_IDS=...
   ```
3. Make sure you're using `yarn start` or `yarn dev` (they load .env file)
4. No spaces around the `=` sign in .env file

## Bot connects but commands don't work

**Solution**: Check command registration.

1. Make sure `DISCORD_APPLICATION_ID` is correct
2. Commands can take up to 1 hour to update globally
3. Use `DISCORD_DEV_GUILD_ID` for instant updates during development
4. Check bot logs for command registration errors

## Database connection works but queries fail

**Solution**: Check RLS (Row Level Security) policies.

1. The migration SQL should create policies automatically
2. Make sure you're using `SUPABASE_SERVICE_ROLE_KEY` (not anon key)
3. Service role key bypasses RLS policies

## Still having issues?

1. Check bot logs for specific error messages
2. Verify all environment variables are set correctly
3. Make sure the database migration ran successfully
4. Ensure Discord intents are enabled



