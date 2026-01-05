export function parseDeadline(deadlineStr: string): Date {
  // Try ISO format first (YYYY-MM-DD or YYYY-MM-DD HH:MM)
  const isoMatch = deadlineStr.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}):(\d{2}))?$/);
  if (isoMatch) {
    const date = new Date(isoMatch[1]);
    if (isoMatch[2] && isoMatch[3]) {
      date.setHours(parseInt(isoMatch[2]), parseInt(isoMatch[3]), 0, 0);
    }
    return date;
  }

  // Try relative format (e.g., "2 days", "1 week", "3 hours")
  const relativeMatch = deadlineStr.match(/^(\d+)\s*(day|days|week|weeks|hour|hours|minute|minutes)s?$/i);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2].toLowerCase();
    const now = new Date();
    
    if (unit.startsWith('day')) {
      now.setDate(now.getDate() + amount);
    } else if (unit.startsWith('week')) {
      now.setDate(now.getDate() + amount * 7);
    } else if (unit.startsWith('hour')) {
      now.setHours(now.getHours() + amount);
    } else if (unit.startsWith('minute')) {
      now.setMinutes(now.getMinutes() + amount);
    }
    
    return now;
  }

  // Try parsing as Date string
  const parsed = new Date(deadlineStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  throw new Error(`Invalid deadline format: ${deadlineStr}`);
}



