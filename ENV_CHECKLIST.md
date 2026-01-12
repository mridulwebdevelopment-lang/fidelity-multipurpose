# Environment Variables Checklist

## ✅ Required Variables (Bot won't start without these)

```env
# Supabase Database
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Discord Bot Core
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_APPLICATION_ID=your_application_id

# Discord Channels
TASKS_CATEGORY_ID=your_category_id
RED_ALERTS_CHANNEL_ID=your_red_alerts_channel_id
DAILY_SUMMARY_CHANNEL_ID=your_daily_summary_channel_id

# Discord Users (Staff)
KASH_USER_ID=your_kash_user_id
RYAN_USER_ID=your_ryan_user_id
ISAAC_USER_ID=your_isaac_user_id
STAFF_USER_IDS=user_id_1,user_id_2,user_id_3
```

## 🔧 Optional Variables (Have defaults, but recommended to set)

```env
# Discord Dev Guild (for faster command registration)
DISCORD_DEV_GUILD_ID=your_guild_id  # optional: leave empty for global commands

# Staff Roles (optional)
STAFF_ROLE_IDS=role_id_1,role_id_2  # optional: comma-separated role IDs
```

## 💰 Funding Feature (NEW - Optional)

**To enable the funding table OCR feature, only set:**

```env
# Funding Target Tracker
FUNDING_CHANNEL_ID=your_funding_channel_id  # REQUIRED to enable feature
```

**Note:** 
- If `FUNDING_CHANNEL_ID` is empty or not set, the funding feature is disabled.
- `FUNDING_END_DATE` is **NOT required** - you can set the end date via the `/update` command's `end_date` option or `days_left` option instead.

## 🔄 Shift Check-in Feature (Optional - Legacy)

```env
CHATTER_USER_IDS=user_id_1,user_id_2  # optional
SHIFT_CHANNEL_ID=your_shift_channel_id  # optional (default: 1457741396218745028)
SHIFT_OPENING_REMINDER_MINUTES=30  # optional (default: 30)
SHIFT_ZERO_ACTIVITY_MINUTES=60  # optional (default: 60)
SHIFT_MISSING_END_HOURS=12  # optional (default: 12)
SHIFT_MISSING_START_COOLDOWN_MINUTES=720  # optional (default: 720)
SHIFT_REPEAT_OFFENDER_THRESHOLD=3  # optional (default: 3)
SHIFT_PERIODIC_REMINDER_HOURS=2  # optional (default: 2)
```

## 📝 Quick Setup for Funding Feature

If you only want to use the **funding table OCR feature**, minimum required:

1. **All required variables above** (Supabase, Discord bot token, etc.)
2. **Plus:**
   ```env
   FUNDING_CHANNEL_ID=your_funding_channel_id
   ```
   
That's it! You can set the end date later via `/update` command if needed.

## 🚨 Common Issues

- **"Invalid environment variables" error**: Check that all **required** variables are set
- **Funding feature not working**: Make sure `FUNDING_CHANNEL_ID` is set to a valid Discord channel ID
- **Bot can't find channel**: Verify channel IDs are correct (right-click channel → Copy ID in Discord)

