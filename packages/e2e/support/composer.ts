import {
    createComposerSpaceChart as createSpaceChartVia,
    createComposerDashboard as createVia,
    deleteComposerSpace as deleteSpaceVia,
    deleteComposerDashboard as deleteVia,
    type ComposerApiSend,
    type ComposerDashboard,
    type ComposerSpaceChart,
} from '../../api-tests/helpers/composerDashboard';
import { json } from './api';
import type { TrackedApi } from './test';

export type { ComposerDashboard, ComposerSpaceChart };

// Through the tracked `api`, so cleanup.ts still deletes the dashboard if a test skips deleting it.
const trackedApiSend =
    (api: TrackedApi): ComposerApiSend =>
    async <T>(
        method: 'POST' | 'PATCH' | 'DELETE',
        path: string,
        body?: unknown,
    ): Promise<T> => {
        const send = {
            POST: () => api.post(path, { data: body }),
            PATCH: () => api.patch(path, { data: body }),
            DELETE: () => api.delete(path),
        }[method];
        const response = await send();
        if (!response.ok()) {
            throw new Error(
                `${method} ${path} → ${response.status()}: ${await response.text()}`,
            );
        }
        return json<T>(response);
    };

export const createComposerDashboard = (
    api: TrackedApi,
    options?: Parameters<typeof createVia>[1],
) => createVia(trackedApiSend(api), options);

// Delete right after the test: content-as-code CLI specs on the same preview refuse composer tiles.
export const deleteComposerDashboard = (
    api: TrackedApi,
    dashboardUuid: string,
) => deleteVia(trackedApiSend(api), dashboardUuid);

export const createComposerSpaceChart = (
    api: TrackedApi,
    options?: Parameters<typeof createSpaceChartVia>[1],
) => createSpaceChartVia(trackedApiSend(api), options);

// Deleting the space deletes the composer charts it owns.
export const deleteComposerSpace = (api: TrackedApi, spaceUuid: string) =>
    deleteSpaceVia(trackedApiSend(api), spaceUuid);
