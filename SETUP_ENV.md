# Environment Setup

## Location of .env file

**IMPORTANT: The `.env` file MUST be created inside `multipurpose-bot/bot/` folder!**

Full path: `multipurpose-bot/bot/.env`

## Steps to Create .env File

1. Navigate to the bot folder:
   ```bash
   cd multipurpose-bot/bot
   ```

2. Create the `.env` file:
   ```bash
   # On Windows (PowerShell)
   New-Item -ItemType File -Path .env
   
   # Or just create it manually in your editor
   ```

3. Copy the contents from `.env.example` and fill in your values:
   ```env
   # Supabase Database (SAME as web app)
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

   # Discord Bot Configuration
   DISCORD_BOT_TOKEN=your_discord_bot_token
   DISCORD_APPLICATION_ID=your_discord_application_id
   DISCORD_DEV_GUILD_ID=your_guild_id_optional

   # Discord Channels & Users
   TASKS_CATEGORY_ID=your_category_id_for_task_channels
   RED_ALERTS_CHANNEL_ID=your_red_alerts_channel_id
   KASH_USER_ID=your_kash_discord_user_id
   RYAN_USER_ID=your_ryan_discord_user_id
   STAFF_USER_IDS=user_id_1,user_id_2,user_id_3
   ```

## Verify .env File Location

The `.env` file should be in the same directory as:
- `package.json`
- `tsconfig.json`
- `src/` folder
- `README.md`

If your file structure looks like this, you're good:
```
multipurpose-bot/
  └── bot/
      ├── .env          ← YOUR .env FILE HERE
      ├── package.json
      ├── tsconfig.json
      ├── src/
      └── README.md
```



