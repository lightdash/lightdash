import type { Pool } from 'pg';
import { z } from 'zod';
import type { LightdashApi } from './api';
import { queryRows } from './db';
import { test } from './fixtures';

/**
 * F5, or a skip when it cannot exist. The ensure endpoint only provisions a
 * playground into an organization with no projects; otherwise it returns the
 * organization's first project and creates nothing.
 */
export const ensurePlayground = async (api: LightdashApi, db: Pool) => {
    const ensured = await api.post(
        '/api/v1/org/playground-projects/ensure',
        {},
        z.object({ projectUuid: z.string(), created: z.boolean() }),
    );
    const [project] = await queryRows(
        db,
        'SELECT provisioning_source FROM projects WHERE project_uuid = $1',
        [ensured.projectUuid],
        z.object({ provisioning_source: z.string().nullable() }),
    );
    test.skip(
        project?.provisioning_source !== 'playground',
        `the F5 playground fixture is impossible in an organization that already has a project: ensure provisions a playground only into an empty organization and returned the existing project ${ensured.projectUuid} instead. No flag or setting changes this.`,
    );
    return ensured;
};
