// Regex to detect Slack IDs: C (public channel), G (private channel), U/W (user/DM)
export const SLACK_ID_REGEX = /^[CGUW][A-Z0-9]{8,}$/i;
