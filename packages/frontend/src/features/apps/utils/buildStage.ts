import { assertUnreachable, type AppVersionStatus } from '@lightdash/common';

export const BUILD_STAGES = [
    'Preparing',
    'Exploring your data',
    'Writing the app',
    'Building the preview',
] as const;

/** Stage names for a change to an existing app, index-aligned with BUILD_STAGES. */
const ITERATION_BUILD_STAGES = [
    'Preparing',
    'Reading your app and data',
    'Making the change',
    'Building the preview',
] as const;

/** Stage name to show; changes to an existing app read their code first. */
export const getBuildStageLabel = (
    index: number,
    isIteration: boolean,
): string => (isIteration ? ITERATION_BUILD_STAGES : BUILD_STAGES)[index];

const WRITE_STEP = /^(creat|edit|updat|modif|writ)/i;

/** Index into BUILD_STAGES; BUILD_STAGES.length once the build is done. */
export const getBuildStageIndex = (
    status: AppVersionStatus | null,
    activity: string[],
): number => {
    if (status === null) return 0;
    switch (status) {
        case 'pending':
        case 'sandbox':
        case 'catalog':
        case 'compact':
            return 0;
        case 'generating':
            return activity.some((step) => WRITE_STEP.test(step.trim()))
                ? 2
                : 1;
        case 'building':
        case 'packaging':
            return 3;
        case 'ready':
        case 'error':
            return BUILD_STAGES.length;
        default:
            return assertUnreachable(status, `Unknown status ${status}`);
    }
};
