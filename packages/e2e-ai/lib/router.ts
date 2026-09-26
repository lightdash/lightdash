import { SEED_ORG_1 } from '@lightdash/common';
import type { Pool } from 'pg';
import { z } from 'zod';
import { projectUuid } from './agents';
import { resultsOf, type LightdashApi } from './api';
import { applyUndo, markUndone, recordUndo, type Undo } from './cleanupLedger';

const routerPath = '/api/v1/org/aiRouter';

// agentSelector.ts: an agent uuid the model invents becomes the first candidate.
export const ROUTER_FALLBACK_REASONING = 'Defaulting to first available agent';

const routerSchema = z.object({
    enabled: z.boolean(),
    projectUuids: z.array(z.string()),
});

/**
 * Runs `fn` with the org's AI router enabled for the seed project, then puts
 * the router back as it was; a router that did not exist is removed.
 */
export const withRouterEnabled = async <T>(
    api: LightdashApi,
    db: Pool,
    fn: () => Promise<T>,
): Promise<T> => {
    const current = await api.send('GET', routerPath);
    const restore: Undo =
        current.status === 404
            ? {
                  kind: 'sql',
                  text: 'DELETE FROM ai_router WHERE organization_uuid = $1',
                  params: [SEED_ORG_1.organization_uuid],
              }
            : {
                  kind: 'http',
                  method: 'PUT',
                  path: routerPath,
                  body: resultsOf(current, routerSchema),
              };
    const undo = recordUndo(restore);
    await api.put(
        routerPath,
        { enabled: true, projectUuids: [projectUuid] },
        routerSchema,
    );
    try {
        return await fn();
    } finally {
        await applyUndo(api, db, restore);
        markUndone(undo);
    }
};
