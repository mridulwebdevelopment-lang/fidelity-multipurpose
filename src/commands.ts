import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';

export const taskAssignCommand = new SlashCommandBuilder()
  .setName('task')
  .setDescription('Task management commands')
  .addSubcommand((sub) =>
    sub
      .setName('assign')
      .setDescription('Assign a task to a user')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('User to assign the task to').setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('title').setDescription('Task title').setRequired(true).setMaxLength(200),
      )
      .addStringOption((opt) =>
        opt.setName('description').setDescription('Task description').setMaxLength(2000),
      )
      .addStringOption((opt) =>
        opt
          .setName('priority')
          .setDescription('Task priority')
          .addChoices(
            { name: 'Low', value: 'low' },
            { name: 'Medium', value: 'medium' },
            { name: 'High', value: 'high' },
            { name: 'Urgent', value: 'urgent' },
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName('deadline')
          .setDescription('Deadline (YYYY-MM-DD HH:MM or relative like "2 days")')
          .setMaxLength(50),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('update')
      .setDescription('Update task status')
      .addStringOption((opt) =>
        opt
          .setName('status')
          .setDescription('New status')
          .setRequired(true)
          .addChoices(
            { name: 'In Progress', value: 'in_progress' },
            { name: 'Completed', value: 'completed' },
            { name: 'Cancelled', value: 'cancelled' },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('List tasks')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('Filter by assigned user'),
      )
      .addStringOption((opt) =>
        opt
          .setName('status')
          .setDescription('Filter by status')
          .addChoices(
            { name: 'Pending', value: 'pending' },
            { name: 'In Progress', value: 'in_progress' },
            { name: 'Completed', value: 'completed' },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('quick')
      .setDescription('Quick assign with template (staff only)')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('User to assign the task to').setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('template')
          .setDescription('Task template')
          .setRequired(true)
          .addChoices(
            { name: 'Review Content', value: 'review_content' },
            { name: 'Fix Bug', value: 'fix_bug' },
            { name: 'Create Content', value: 'create_content' },
            { name: 'Follow Up', value: 'follow_up' },
            { name: 'Research', value: 'research' },
            { name: 'Update Documentation', value: 'update_docs' },
          ),
      )
      .addStringOption((opt) =>
        opt.setName('details').setDescription('Additional details').setMaxLength(500),
      )
      .addStringOption((opt) =>
        opt
          .setName('priority')
          .setDescription('Task priority')
          .addChoices(
            { name: 'Low', value: 'low' },
            { name: 'Medium', value: 'medium' },
            { name: 'High', value: 'high' },
            { name: 'Urgent', value: 'urgent' },
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName('deadline')
          .setDescription('Deadline (e.g., "2 days", "1 week")')
          .setMaxLength(50),
      ),
  );

export const startShiftCommand = new SlashCommandBuilder()
  .setName('startshift')
  .setDescription('Start your shift (logs timestamp + DMs the full shift playbook)')
  .setDMPermission(false); // Only works in servers, not DMs

export const endShiftCommand = new SlashCommandBuilder()
  .setName('endshift')
  .setDescription('End your shift (logs timestamp)')
  .setDMPermission(false); // Only works in servers, not DMs

export const updateFundingCommand = new SlashCommandBuilder()
  .setName('update')
  .setDescription('Upload funding table image and recalculate daily + per-shift targets')
  .addAttachmentOption((opt) =>
    opt
      .setName('image')
      .setDescription('Upload the funding table image (required)')
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName('end_date')
      .setDescription('Campaign end date (UK) in YYYY-MM-DD')
      .setMaxLength(10),
  )
  .addIntegerOption((opt) =>
    opt
      .setName('days_left')
      .setDescription('Override days left (integer). If set, takes precedence over end_date.')
      .setMinValue(1),
  )
  .addNumberOption((opt) =>
    opt
      .setName('add')
      .setDescription('Money added (reduces remaining needed). Example: 25.50')
      .setMinValue(0),
  )
  .addNumberOption((opt) =>
    opt
      .setName('remove')
      .setDescription('Money removed (increases remaining needed). Example: 10')
      .setMinValue(0),
  )
  .addBooleanOption((opt) =>
    opt.setName('reset_adjustment').setDescription('If true, clears any previous add/remove adjustments.'),
  )
  .setDMPermission(false);

export const rotaCommand = new SlashCommandBuilder()
  .setName('rota')
  .setDescription('Submit or view your rota for the current UK week (Mon–Sun)')
  .addBooleanOption((opt) =>
    opt
      .setName('all_week_working')
      .setDescription('If true, marks all 7 days this week as Working')
  )
  .addStringOption((opt) =>
    opt
      .setName('holiday_day')
      .setDescription('Pick 1 day as Holiday (all other days will be Working)')
      .addChoices(
        { name: 'Monday', value: 'mon' },
        { name: 'Tuesday', value: 'tue' },
        { name: 'Wednesday', value: 'wed' },
        { name: 'Thursday', value: 'thu' },
        { name: 'Friday', value: 'fri' },
        { name: 'Saturday', value: 'sat' },
        { name: 'Sunday', value: 'sun' },
      )
  )
  .setDMPermission(false);

export const ALL_COMMANDS = [
  taskAssignCommand,
  startShiftCommand,
  endShiftCommand,
  updateFundingCommand,
  rotaCommand,
].map((c) => c.toJSON());

export function isChatInput(i: any): i is ChatInputCommandInteraction {
  return Boolean(i && i.isChatInputCommand?.());
}
