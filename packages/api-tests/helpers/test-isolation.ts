import { SEED_PROJECT } from '@lightdash/common';
import { randomUUID } from 'crypto';
import { ApiClient } from './api-client';

const apiUrl = '/api/v1';

/**
 * Generate a globally unique name for test resources to prevent
 * collisions when test files run in parallel.
 */
export function uniqueName(base: string): string {
    return `${base} [${randomUUID().slice(0, 8)}]`;
}

/**
 * Tracks resources created during a test file and provides
 * cleanup in dependency order (charts -> dashboards -> spaces).
 */
export class TestResourceTracker {
    private charts: string[] = [];

    private dashboards: string[] = [];

    private spaces: string[] = [];

    trackChart(uuid: string): void {
        this.charts.push(uuid);
    }

    trackDashboard(uuid: string): void {
        this.dashboards.push(uuid);
    }

    trackSpace(uuid: string): void {
        this.spaces.push(uuid);
    }

    async cleanup(client: ApiClient): Promise<void> {
        for (const uuid of this.charts) {
            await client
                .delete(`${apiUrl}/saved/${uuid}`, {
                    failOnStatusCode: false,
                })
                .catch(() => {});
        }
        for (const uuid of this.dashboards) {
            await client
                .delete(`${apiUrl}/dashboards/${uuid}`, {
                    failOnStatusCode: false,
                })
                .catch(() => {});
        }
        for (const uuid of this.spaces) {
            await client
                .delete(
                    `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${uuid}`,
                    { failOnStatusCode: false },
                )
                .catch(() => {});
        }
    }
}
