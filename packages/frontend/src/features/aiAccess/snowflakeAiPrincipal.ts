import { type AiServiceAccountTestResult } from '@lightdash/common';

export const getSnowflakeAiPrincipal = (
    verification: AiServiceAccountTestResult | null,
): string | null =>
    verification?.ok &&
    verification.observed.currentUser &&
    verification.observed.currentRole
        ? `${verification.observed.currentUser} with role ${verification.observed.currentRole}`
        : null;
