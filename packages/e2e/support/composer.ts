import {
    createComposerDashboard as createVia,
    deleteComposerDashboard as deleteVia,
    type ComposerApiSend,
    type ComposerDashboard,
} from '../../api-tests/helpers/composerDashboard';
import { json } from './api';
import type { TrackedApi } from './test';

export type { ComposerDashboard };

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

export const createComposerDashboard = (api: TrackedApi) =>
    createVia(trackedApiSend(api));

// Delete right after the test: content-as-code CLI specs on the same preview refuse composer tiles.
export const deleteComposerDashboard = (
    api: TrackedApi,
    dashboardUuid: string,
) => deleteVia(trackedApiSend(api), dashboardUuid);
