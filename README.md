# Multipurpose Bot - Staff Accountability & Task Management

A Discord bot for tracking assigned tasks, deadlines, and ownership with automatic reminders and escalation.

## Features

- **Task Assignment**: Assign tasks to users via Discord commands
- **Auto-Ping**: Automatic reminders if tasks aren't updated for 12+ hours
- **Escalation**: Tasks escalate to `#red-alerts` channel after 2 reminders
- **Daily Summary**: Daily "Outstanding Tasks" summary posted at 9 AM
- **Per-User Channels**: Automatic channel creation for each user assigned a task
- **DM Notifications**: Users receive DM notifications when tasks are assigned
- **Web Dashboard**: View all tasks in the web app
- **Chatter Shift Check-In**: `/startshift` DMs the shift playbook + logs start/end; `/endshift` closes the shift
- **Shift Compliance Flags (Silent)**: Flags Isaac if chatter misses `/startshift` or `/endshift`, or has zero activity during a shift

## Setup

1. **Install dependencies:**
   ```bash
   yarn install
   ```

2. **Create `.env` file inside the `multipurpose-bot/bot/` folder:**
   
   Create a file named `.env` in the `multipurpose-bot/bot/` directory:
   ```env
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

   DISCORD_BOT_TOKEN=your_discord_bot_token
   DISCORD_APPLICATION_ID=your_application_id
   DISCORD_DEV_GUILD_ID=your_guild_id

   TASKS_CATEGORY_ID=your_category_id_for_task_channels
   RED_ALERTS_CHANNEL_ID=your_red_alerts_channel_id
   DAILY_SUMMARY_CHANNEL_ID=your_daily_summary_channel_id

   KASH_USER_ID=your_kash_discord_user_id
   RYAN_USER_ID=your_ryan_discord_user_id
   ISAAC_USER_ID=your_isaac_discord_user_id

   STAFF_USER_IDS=user_id_1,user_id_2
   STAFF_ROLE_IDS=role_id_1,role_id_2  # optional

   # Optional (shift compliance tuning)
   CHATTER_USER_IDS=user_id_1,user_id_2  # optional (explicit list to enforce /startshift)
   SHIFT_OPENING_REMINDER_MINUTES=30
   SHIFT_ZERO_ACTIVITY_MINUTES=60
   SHIFT_MISSING_END_HOURS=12
   SHIFT_MISSING_START_COOLDOWN_MINUTES=720
   SHIFT_REPEAT_OFFENDER_THRESHOLD=3
   ```

3. **Run database migration:**
   - Go to your Supabase SQL Editor
   - Run the SQL from `tasks_migration.sql` (in root) or `supabase_migration.sql` (in bot folder)
   - This creates the `tasks` table

4. **Enable Discord Bot Intents:**
   - Go to https://discord.com/developers/applications
   - Select your bot → Bot section
   - Enable **SERVER MEMBERS INTENT** and **MESSAGE CONTENT INTENT**
   - Save changes
   - See `DISCORD_SETUP.md` for detailed instructions

5. **Run the bot:**
   ```bash
   yarn dev
   ```

## Commands

- `/task assign` - Assign a task to a user (staff only)
- `/task update` - Update task status (in task channel)
- `/task list` - List all tasks with optional filters
- `/startshift` - Start shift (logs timestamp + DMs full playbook)
- `/endshift` - End shift (logs timestamp + DMs end-of-shift checklist)

## How It Works

1. Staff assigns tasks using `/task assign` command
2. Bot creates a channel for the user (if it doesn't exist)
3. Bot sends notification in channel and via DM
4. Task monitor checks every hour for tasks needing reminders
5. After 12 hours without update, task is pinged
6. After 2 reminders, task escalates to `#red-alerts`
7. Daily summary is posted at 9 AM with all outstanding tasks
