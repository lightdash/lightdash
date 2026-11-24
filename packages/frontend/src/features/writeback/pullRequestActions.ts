import { CiMergeState, type CiChecks } from '@lightdash/common';

// READY/UNSTABLE are the mergeable states (a failing non-required check is
// UNSTABLE but still mergeable); everything else can't be merged right now.
export const isMergeable = (ciChecks: CiChecks | null): boolean =>
    !!ciChecks &&
    !ciChecks.merged &&
    ciChecks.state === 'open' &&
    (ciChecks.mergeState === CiMergeState.READY ||
        ciChecks.mergeState === CiMergeState.UNSTABLE);
