import type { SnowflakeAiBoundaryCheck } from '@lightdash/common';

export type GuideStepStatus = 'to do' | 'done' | 'failed';

export const getSnowflakeAiBoundaryStepStatuses = ({
    isSnowflake,
    enterpriseConfirmed,
    roleConfirmed,
    aiSignInEnabled,
    maskingConfirmed,
    ceilingConfirmed,
    signedIn,
    checks,
    restrictionsEnabled,
}: {
    isSnowflake: boolean;
    enterpriseConfirmed: boolean;
    roleConfirmed: boolean;
    aiSignInEnabled: boolean;
    maskingConfirmed: boolean;
    ceilingConfirmed: boolean;
    signedIn: boolean;
    checks: SnowflakeAiBoundaryCheck[] | null;
    restrictionsEnabled: boolean;
}): GuideStepStatus[] => [
    !isSnowflake
        ? 'failed'
        : enterpriseConfirmed && roleConfirmed
          ? 'done'
          : 'to do',
    aiSignInEnabled ? 'done' : 'to do',
    maskingConfirmed ? 'done' : 'to do',
    ceilingConfirmed ? 'done' : 'to do',
    signedIn ? 'done' : 'to do',
    checks === null
        ? 'to do'
        : checks.some((check) => check.status === 'fail')
          ? 'failed'
          : checks.some((check) => check.status === 'skipped')
            ? 'to do'
            : 'done',
    restrictionsEnabled ? 'done' : 'to do',
];
