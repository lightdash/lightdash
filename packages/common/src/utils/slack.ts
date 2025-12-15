/**
 * Regex to detect Slack IDs: C (public channel), G (private channel), U/W (user/DM)
 * @example
 * const isSlackId = SLACK_ID_REGEX.test('C1234567890');
 * const isSlackId = SLACK_ID_REGEX.test('G1234567890');
 * const isSlackId = SLACK_ID_REGEX.test('U1234567890');
 * const isSlackId = SLACK_ID_REGEX.test('W1234567890');
 */
export const SLACK_ID_REGEX = /^[CGUW][A-Z0-9]{8,}$/i;
