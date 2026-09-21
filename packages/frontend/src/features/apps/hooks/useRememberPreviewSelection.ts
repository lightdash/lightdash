import {
    type ApiError,
    type ApiGetAppResponse,
    type ApiSetDataAppVizPreviewSelectionRequest,
    type DataAppVizPreviewSelection,
    type DataAppVizPreviewSelectionInput,
} from '@lightdash/common';
import {
    useMutation,
    useQueryClient,
    type InfiniteData,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { lightdashApi } from '../../../api';
import useApp from '../../../providers/App/useApp';

type GetAppResult = ApiGetAppResponse['results'];

type RememberParams = {
    projectUuid: string;
    appUuid: string;
    selection: DataAppVizPreviewSelectionInput;
};

const setPreviewSelection = ({
    projectUuid,
    appUuid,
    selection,
}: RememberParams) =>
    lightdashApi<undefined>({
        method: 'PUT',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/preview-selection`,
        body: JSON.stringify({
            selection,
        } satisfies ApiSetDataAppVizPreviewSelectionRequest),
    });

/**
 * Remembers what a chart type was last previewed with, so reopening it offers
 * the same inputs.
 *
 * Fire and forget: the author is authoring, so nothing here reports back.
 * A refused write (a chart type they may only view, or one the registry owns)
 * leaves the session exactly as it was.
 */
export const useRememberPreviewSelection = ({
    projectUuid,
    appUuid,
    appUuidOrSlug,
    enabled,
}: {
    projectUuid: string | undefined;
    /** Null until a chart type exists; nothing is remembered before then. */
    appUuid: string | null;
    /** The identifier the page reads the app by, when that is a slug. */
    appUuidOrSlug: string | undefined;
    /** False for a chart type this user cannot edit, or the registry owns. */
    enabled: boolean;
}): ((selection: DataAppVizPreviewSelectionInput) => void) => {
    const queryClient = useQueryClient();
    const { user } = useApp();
    const userUuid = user.data?.userUuid;

    const { mutate } = useMutation<undefined, ApiError, RememberParams>({
        mutationFn: setPreviewSelection,
        // Written into the cached app rather than invalidated, so a save in
        // the middle of authoring never refetches under the author.
        onSuccess: (_result, variables) => {
            if (!userUuid) return;
            const remembered: DataAppVizPreviewSelection = {
                version: 1,
                ...variables.selection,
                updatedAt: new Date(),
                updatedByUserUuid: userUuid,
            };
            const identifiers = new Set(
                [variables.appUuid, appUuidOrSlug].filter(
                    (identifier): identifier is string => Boolean(identifier),
                ),
            );
            identifiers.forEach((identifier) => {
                queryClient.setQueryData<InfiniteData<GetAppResult>>(
                    ['app', variables.projectUuid, identifier],
                    (current) =>
                        current && {
                            ...current,
                            pages: current.pages.map((page, index) =>
                                index === 0
                                    ? { ...page, previewSelection: remembered }
                                    : page,
                            ),
                        },
                );
            });
        },
    });

    return useCallback(
        (selection: DataAppVizPreviewSelectionInput) => {
            if (!enabled || !projectUuid || appUuid === null) return;
            mutate({ projectUuid, appUuid, selection });
        },
        [appUuid, enabled, mutate, projectUuid],
    );
};
