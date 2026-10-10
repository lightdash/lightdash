import { type AuthType } from '@lightdash/common';

export const mcpAgentPermissionsApply = (
    authenticationType: AuthType | undefined,
): boolean =>
    authenticationType === 'oauth' || authenticationType === 'session';
