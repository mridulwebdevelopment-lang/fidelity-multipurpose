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
   DAILY_SUMMARY_CHANNEL_ID=your_daily_summary_channel_id
   KASH_USER_ID=your_kash_discord_user_id
   RYAN_USER_ID=your_ryan_discord_user_id
   ISAAC_USER_ID=your_isaac_discord_user_id
   STAFF_USER_IDS=user_id_1,user_id_2,user_id_3
   STAFF_ROLE_IDS=role_id_1,role_id_2  # optional

   # Funding Target Tracker (NEW - Optional)
   # Set FUNDING_CHANNEL_ID to enable the table OCR + daily/shift target feature
   FUNDING_CHANNEL_ID=your_funding_channel_id  # optional: leave empty to disable
   # FUNDING_END_DATE is NOT required - you can set it via /update command instead

  # Optional (legacy shift settings)
  # NOTE: Shift commands are currently disabled in code, so these are unused unless you re-enable that feature.
  CHATTER_USER_IDS=
  SHIFT_OPENING_REMINDER_MINUTES=30
  SHIFT_ZERO_ACTIVITY_MINUTES=60
  SHIFT_MISSING_END_HOURS=12
  SHIFT_MISSING_START_COOLDOWN_MINUTES=720
  SHIFT_REPEAT_OFFENDER_THRESHOLD=3
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



