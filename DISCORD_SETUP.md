# Discord Bot Setup - Required Intents

## Error: "Used disallowed intents"

This error means your Discord bot needs certain **Intents** enabled in the Discord Developer Portal.

## How to Fix:

1. **Go to Discord Developer Portal**: https://discord.com/developers/applications

2. **Select your bot application**

3. **Go to "Bot" section** (left sidebar)

4. **Scroll down to "Privileged Gateway Intents"**

5. **Enable these intents**:
   - ✅ **SERVER MEMBERS INTENT** (Required - the bot uses `GuildMembers` intent)
   - ✅ **MESSAGE CONTENT INTENT** (Required - the bot reads message content)
   
6. **Click "Save Changes"**

7. **Restart your bot**

## Current Intents Used:

The bot uses these intents (already in code, just need to enable in Discord):
- `Guilds` - Basic server info
- `GuildMessages` - Read messages in channels
- `MessageContent` - Read message content (needs to be enabled)
- `GuildMembers` - Access member information (needs to be enabled)
- `DirectMessages` - Send DMs to users

## Note:

If you don't enable these intents, Discord will disconnect your bot with "Used disallowed intents" error.



