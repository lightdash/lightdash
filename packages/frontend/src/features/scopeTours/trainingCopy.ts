import { type CreateTrainingPreviewResults } from '@lightdash/common';
import { NavigationType } from 'react-router';
import { type LightdashApi } from '../../api';
import { hasCodeLesson } from '../learn/codeLessons';

/** A learner's own fresh copy of the training project, for one walkthrough. */
export const createTrainingPreview = (
    lightdashApi: LightdashApi,
    trainingProjectUuid: string,
) =>
    lightdashApi<CreateTrainingPreviewResults>({
        url: `/projects/${trainingProjectUuid}/training-previews`,
        method: 'POST',
        body: undefined,
    });

export const deleteTrainingPreviews = (
    lightdashApi: LightdashApi,
    trainingProjectUuid: string,
) =>
    lightdashApi<undefined>({
        url: `/projects/${trainingProjectUuid}/training-previews`,
        method: 'DELETE',
        body: undefined,
    });

/**
 * Lessons run on the workspace page (docs lessons, and the content-as-code
 * lessons that are their scopes' walkthroughs); other walkthroughs start at
 * home.
 */
export const opensInWorkspace = (scope: string) =>
    scope.startsWith('docs:') || hasCodeLesson(scope);

/** The URL that opens a walkthrough inside a copy, straight from anywhere. */
export const tourUrlInCopy = (
    copyProjectUuid: string,
    scope: string,
    from: 'learn' | 'home',
) =>
    `/projects/${copyProjectUuid}/${
        opensInWorkspace(scope) ? 'learn/workspace' : 'home'
    }?tour=${encodeURIComponent(scope)}&copy=1${
        from === 'learn' ? '&from=learn' : ''
    }`;

/**
 * Router state on the navigations that leave a copy about to be removed.
 * An editor's unsaved-changes guard lets these through: the copy, and
 * whatever was changed in it, is gone a moment later either way.
 */
export const LEAVING_COPY_STATE = { leavingTrainingCopy: true } as const;

export const isLeavingTrainingCopy = (location: { state?: unknown }) =>
    !!(location.state as { leavingTrainingCopy?: boolean } | null)
        ?.leavingTrainingCopy;

/**
 * Whether an editor's unsaved-changes prompt should let a navigation
 * through as a walkthrough leaving its copy. Only the walkthrough's own push
 * or replace counts: Back and Forward restore a saved entry's state, flag
 * included, and must still ask.
 */
export const isWalkthroughLeavingCopy = ({
    nextLocation,
    historyAction,
}: {
    nextLocation: { state?: unknown };
    historyAction: NavigationType;
}) =>
    historyAction !== NavigationType.Pop && isLeavingTrainingCopy(nextLocation);
