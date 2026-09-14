import type { TestProject } from 'vitest/node';
import { fetchWithConnectionRetry, SITE_URL } from './helpers/api-client';
import { login } from './helpers/auth';
import {
    createProject,
    deleteProjectsByName,
    getAvailableWarehouseConfigs,
    startProjectRefresh,
} from './helpers/projects';
import {
    SharedWarehouseProject,
    sharedWarehouseProjectName,
} from './helpers/shared-projects';

// Databricks is excluded to avoid starting serverless compute; Postgres is
// covered by the seed project.
const warehouseEntries = getAvailableWarehouseConfigs({
    includePostgres: false,
    includeDatabricks: false,
});

export default async function setup(project: TestProject) {
    const health = await fetchWithConnectionRetry(
        `${SITE_URL}/api/v1/health`,
    ).catch(() => null);
    if (!health?.ok) {
        throw new Error(
            `Server health check failed. Is the dev server running at ${SITE_URL}?`,
        );
    }
    const admin = await login();
    const names = warehouseEntries.map(({ name }) =>
        sharedWarehouseProjectName(name),
    );
    // Clean up projects leaked by an interrupted run (names are not unique)
    await deleteProjectsByName(admin, names);

    const sharedProjects: SharedWarehouseProject[] = await Promise.all(
        warehouseEntries.map(async ({ name, config }) => {
            const projectUuid = await createProject(
                admin,
                sharedWarehouseProjectName(name),
                config,
            );
            const jobUuid = await startProjectRefresh(admin, projectUuid);
            return { name, projectUuid, jobUuid };
        }),
    );
    project.provide('sharedWarehouseProjects', sharedProjects);

    return async () => {
        // A leaked project is removed by the next run's setup, so an
        // unreachable server at teardown must not fail the run.
        await deleteProjectsByName(admin, names).catch((error: unknown) => {
            process.stderr.write(
                `Could not delete shared warehouse projects: ${String(error)}\n`,
            );
        });
    };
}
