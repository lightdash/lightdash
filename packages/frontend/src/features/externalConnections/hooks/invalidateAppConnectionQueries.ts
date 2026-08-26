import { type QueryClient } from '@tanstack/react-query';

/** Refresh linked-connection lists, linked-app counts, and preview tokens
 *  whose CSP `img-src` is derived from those links. */
export const invalidateAppConnectionQueries = (
    queryClient: QueryClient,
    projectUuid: string,
    appUuid: string,
) =>
    Promise.all([
        queryClient.invalidateQueries({
            queryKey: ['app-external-connections', projectUuid, appUuid],
        }),
        queryClient.invalidateQueries({
            queryKey: ['external-connections', projectUuid],
        }),
        queryClient.invalidateQueries({
            queryKey: ['data-app-viz-preview-token', projectUuid, appUuid],
        }),
        queryClient.invalidateQueries({
            queryKey: ['app-preview-token', projectUuid, appUuid],
        }),
    ]);
