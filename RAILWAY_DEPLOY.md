# Railway Deployment Guide - Discord Bot

This guide will help you deploy your Discord bot to Railway.

## 🚀 Quick Deploy to Railway

### Step 1: Prepare Your Repository

1. Make sure all files are committed to your repository
2. The bot folder should be at the root or in a subdirectory
3. Railway will auto-detect Node.js and the `Procfile`

### Step 2: Create Railway Project

1. Go to [railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo" (or use Railway CLI)
4. Choose your repository
5. If the bot is in a subdirectory, set the **Root Directory** to `bot` in Railway settings
6. Railway will auto-detect Node.js and the `Procfile`

### Step 3: Set Environment Variables

In Railway dashboard, go to your project → **Variables** and add all required environment variables:

**Required Environment Variables:**

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_APPLICATION_ID=your_application_id
DISCORD_DEV_GUILD_ID=your_guild_id (optional, can be empty)

TASKS_CATEGORY_ID=your_category_id_for_task_channels
RED_ALERTS_CHANNEL_ID=your_red_alerts_channel_id
DAILY_SUMMARY_CHANNEL_ID=your_daily_summary_channel_id
STAFF_USER_IDS=user_id_1,user_id_2,user_id_3
STAFF_ROLE_IDS=role_id_1,role_id_2 (optional, can be empty)
KASH_USER_ID=your_kash_user_id
RYAN_USER_ID=your_ryan_user_id
```

**How to get these values:**

- **Discord Bot Token & Application ID**: 
  - Go to https://discord.com/developers/applications
  - Select your bot → Bot section → Copy token
  - General Information → Copy Application ID

- **Discord Channel/Category IDs**:
  - Enable Developer Mode in Discord (User Settings → Advanced)
  - Right-click on channel/category → Copy ID

- **Supabase Credentials**:
  - Go to your Supabase project dashboard
  - Settings → API → Copy URL and Service Role Key

- **Staff User IDs**:
  - Enable Developer Mode in Discord
  - Right-click on staff members → Copy ID
  - Separate multiple IDs with commas (no spaces)

### Step 4: Configure Railway Settings

1. **Root Directory** (if bot is in subdirectory):
   - Settings → Root Directory → Set to `bot`

2. **Build Command** (optional, Railway auto-detects):
   - Railway will automatically run `yarn install`

3. **Start Command**:
   - Railway will use the `Procfile` which runs `yarn start`

### Step 5: Deploy

1. Railway will automatically deploy when you push to GitHub
2. Or manually trigger a deploy from Railway dashboard
3. Wait for build to complete (may take a few minutes on first deploy)

### Step 6: Verify Deployment

1. **Check Railway Logs:**
   - Go to Railway dashboard → Logs
   - You should see:
     - `✅ Database connection successful` or connection test messages
     - `Bot ready as YourBotName#1234`
     - No error messages

2. **Test Discord Bot:**
   - Check if bot is online in Discord (green status)
   - Try `/task list` command
   - Try `/task assign` command (if you're staff)

3. **Check for Errors:**
   - If you see "Invalid environment variables" error, check that all required env vars are set
   - If you see database errors, verify Supabase credentials
   - If bot doesn't connect, verify Discord token

## 🔧 Troubleshooting

### Bot not connecting to Discord

- **Check `DISCORD_BOT_TOKEN`**: Verify it's correct and hasn't been regenerated
- **Check Bot Permissions**: Ensure bot has proper permissions in your Discord server
- **Check Intents**: Enable **SERVER MEMBERS INTENT** and **MESSAGE CONTENT INTENT** in Discord Developer Portal
- **Check Railway Logs**: Look for authentication errors

### Database connection errors

- **Verify `SUPABASE_URL`**: Should be in format `https://xxx.supabase.co`
- **Verify `SUPABASE_SERVICE_ROLE_KEY`**: Should be the service role key (not anon key)
- **Check Supabase Dashboard**: Ensure your project is active and not paused
- **Run Migration**: Make sure you've run the SQL migration in Supabase (see `supabase_migration.sql`)

### Environment variable errors

- **Check all required vars**: The bot will show which variables are missing
- **No spaces in comma-separated values**: `STAFF_USER_IDS=123,456,789` (not `123, 456, 789`)
- **Check for typos**: Variable names are case-sensitive

### Bot commands not working

- **Check `DISCORD_APPLICATION_ID`**: Must match your bot's application ID
- **Commands need to be registered**: The bot auto-registers commands on startup
- **Check bot permissions**: Bot needs proper permissions in the server
- **Check if you're staff**: Some commands require staff permissions

### Build/Deploy errors

- **Node.js version**: Railway should auto-detect Node 20 (specified in `.nvmrc`)
- **Yarn version**: Railway will use the version specified in `package.json` (yarn@4.12.0)
- **Check logs**: Railway logs will show specific build errors

## 📊 Resource Recommendations

For a single bot instance:
- **Memory**: 512MB - 1GB RAM (usually sufficient)
- **CPU**: Standard Railway resources are sufficient
- **Disk**: Minimal (mostly for dependencies)

## 🔄 Updating Your Bot

To update your deployment:

1. Make changes to your code
2. Commit and push to GitHub
3. Railway will automatically redeploy
4. Check logs to verify successful deployment
5. Test bot functionality in Discord

## 📝 Notes

- The bot runs as a **worker** service (not a web service)
- Railway automatically restarts the bot if it crashes
- Environment variables can be updated without redeploying (bot will restart)
- The bot uses TypeScript with `tsx` for runtime execution (no build step needed)
- Database connection is tested on startup but won't block bot initialization

## 🔐 Security Notes

- Never commit `.env` files to your repository
- Use Railway's environment variables (they're encrypted)
- The `SUPABASE_SERVICE_ROLE_KEY` has admin access - keep it secure
- Discord bot tokens should be kept secret

## 📚 Additional Resources

- [Railway Documentation](https://docs.railway.app)
- [Discord.js Documentation](https://discord.js.org)
- [Supabase Documentation](https://supabase.com/docs)

---

**Need help?** Check the main `README.md` and `TROUBLESHOOTING.md` files for more information.









