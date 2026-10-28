import { type AuthType } from '@lightdash/common';

// PATs skip MCP agent policy. Personal CLI logins stay OAuth on this surface
// and need MCP scopes; the CLI browser login only requests REST read/write.
export const mcpAgentPermissionsApply = (
    authenticationType: AuthType | undefined,
): boolean =>
    authenticationType === 'oauth' || authenticationType === 'session';
