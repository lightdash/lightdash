import { type CreateTrainingPreviewResults } from '@lightdash/common';
import { lightdashApi } from '../../api';

/** A learner's own fresh copy of the training project, for one walkthrough. */
export const createTrainingPreview = (trainingProjectUuid: string) =>
    lightdashApi<CreateTrainingPreviewResults>({
        url: `/projects/${trainingProjectUuid}/training-previews`,
        method: 'POST',
        body: undefined,
    });

export const deleteTrainingPreviews = (trainingProjectUuid: string) =>
    lightdashApi<undefined>({
        url: `/projects/${trainingProjectUuid}/training-previews`,
        method: 'DELETE',
        body: undefined,
    });

/** The URL that opens a walkthrough inside a copy, straight from anywhere. */
export const tourUrlInCopy = (
    copyProjectUuid: string,
    scope: string,
    from: 'learn' | 'home',
) =>
    `/projects/${copyProjectUuid}/home?tour=${encodeURIComponent(scope)}&copy=1${from === 'learn' ? '&from=learn' : ''}`;

/**
 * Router state on the navigations that leave a copy about to be removed.
 * An editor's unsaved-changes guard lets these through: the copy, and
 * whatever was changed in it, is gone a moment later either way.
 */
export const LEAVING_COPY_STATE = { leavingTrainingCopy: true } as const;

export const isLeavingTrainingCopy = (location: { state?: unknown }) =>
    !!(location.state as { leavingTrainingCopy?: boolean } | null)
        ?.leavingTrainingCopy;

/** The library starts this module on arrival (the completion dialog's Next). */
export const START_PARAM = 'start';
