import { WarehouseTypes } from '@lightdash/common';
import fs from 'fs';
import path from 'path';
import { expect } from 'vitest';
import { ApiClient, Body } from './api-client';

export const BIGQUERY_CREDENTIALS_PATH = path.resolve(
    __dirname,
    '../../e2e/cypress/fixtures/credentials.json',
);

/**
 * The BigQuery staging dataset (`e2e_jaffle_shop`) holds the same jaffle +
 * `timezone_test` rows as the local Postgres seed, so warehouse-parity tests
 * can assert the same expected counts against it.
 */
export function bigqueryWarehouseConfig(): Record<string, unknown> {
    const keyfileContents = JSON.parse(
        fs.readFileSync(BIGQUERY_CREDENTIALS_PATH, 'utf-8'),
    );
    return {
        project: 'lightdash-database-staging',
        location: 'europe-west1',
        dataset: 'e2e_jaffle_shop',
        keyfileContents,
        type: WarehouseTypes.BIGQUERY,
    };
}

/**
 * True when a BigQuery service-account keyfile is available. CI writes the
 * `GCP_CREDENTIALS` secret to this path; locally it is usually absent, so
 * BigQuery-only suites should `describe.skipIf(!hasBigqueryCredentials())`.
 */
export function hasBigqueryCredentials(): boolean {
    if (!fs.existsSync(BIGQUERY_CREDENTIALS_PATH)) return false;
    try {
        const creds = JSON.parse(
            fs.readFileSync(BIGQUERY_CREDENTIALS_PATH, 'utf-8'),
        ) as { private_key?: string };
        return Boolean(creds.private_key);
    } catch {
        return false;
    }
}

export async function createProject(
    client: ApiClient,
    projectName: string,
    warehouseConnection: Record<string, unknown>,
): Promise<string> {
    const resp = await client.post<{
        results: { project: { projectUuid: string } };
    }>('/api/v1/org/projects', {
        name: projectName,
        type: 'DEFAULT',
        dbtConnection: {
            target: '',
            environment: [],
            type: 'dbt',
            project_dir: process.env.DBT_PROJECT_DIR || '/usr/app/dbt',
        },
        dbtVersion: 'v1.7',
        warehouseConnection,
    });
    expect(resp.status).toBe(200);
    return resp.body.results.project.projectUuid;
}

async function waitForV1JobCompletion(
    client: ApiClient,
    jobUuid: string,
    maxRetries = 120,
): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
        const resp = await client.get<
            Body<{ jobStatus: 'STARTED' | 'RUNNING' | 'DONE' | 'ERROR' }>
        >(`/api/v1/jobs/${jobUuid}`);
        const { jobStatus } = resp.body.results;
        if (jobStatus === 'ERROR') return false;
        if (jobStatus === 'DONE') return true;
        await new Promise((r) => setTimeout(r, 1000));
    }
    return false;
}

/**
 * Create a project, run a full refresh, and return its UUID once compiled.
 * Throws if the refresh job fails so callers fail loudly instead of querying
 * an empty project.
 */
export async function createAndRefreshProject(
    client: ApiClient,
    projectName: string,
    warehouseConnection: Record<string, unknown>,
): Promise<string> {
    const projectUuid = await createProject(
        client,
        projectName,
        warehouseConnection,
    );

    const refreshResp = await client.post<Body<{ jobUuid: string }>>(
        `/api/v1/projects/${projectUuid}/refresh`,
    );
    expect(refreshResp.status).toBe(200);

    const success = await waitForV1JobCompletion(
        client,
        refreshResp.body.results.jobUuid,
    );
    if (!success) {
        throw new Error(`Project refresh failed for "${projectName}"`);
    }
    return projectUuid;
}

export async function deleteProjectsByName(
    client: ApiClient,
    names: string[],
): Promise<void> {
    const resp = await client.get<
        Body<{ projectUuid: string; name: string }[]>
    >('/api/v1/org/projects');
    expect(resp.status).toBe(200);
    for (const project of resp.body.results) {
        if (names.includes(project.name)) {
            await client.delete(`/api/v1/org/projects/${project.projectUuid}`);
        }
    }
}
