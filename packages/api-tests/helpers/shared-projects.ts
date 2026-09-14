import { inject } from 'vitest';
import { ApiClient } from './api-client';
import { waitForProjectRefresh } from './projects';

/**
 * One project per credentialed remote warehouse, created and refreshed once
 * per run by `vitest.global-setup.ts` and shared by every parity suite. The
 * refresh job is still running when tests start; `useSharedWarehouseProject`
 * waits for it. Suites must not mutate these projects (settings, timezone,
 * connection): a suite that needs its own configuration creates its own.
 */
export type SharedWarehouseProject = {
    name: string;
    projectUuid: string;
    jobUuid: string;
};

declare module 'vitest' {
    export interface ProvidedContext {
        sharedWarehouseProjects: SharedWarehouseProject[];
    }
}

export function sharedWarehouseProjectName(warehouseName: string): string {
    return `shared ${warehouseName} parity project`;
}

export async function useSharedWarehouseProject(
    client: ApiClient,
    warehouseName: string,
): Promise<string> {
    const shared = inject('sharedWarehouseProjects').find(
        (project) => project.name === warehouseName,
    );
    if (!shared) {
        throw new Error(
            `No shared ${warehouseName} project exists: global setup only creates projects for warehouses with credentials.`,
        );
    }
    await waitForProjectRefresh(
        client,
        sharedWarehouseProjectName(warehouseName),
        shared.jobUuid,
    );
    return shared.projectUuid;
}
