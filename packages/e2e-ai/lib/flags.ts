import { z } from 'zod';
import type { LightdashApi } from './api';

/** A feature flag as the backend resolves it for the logged-in user. */
export const isFeatureFlagEnabled = async (api: LightdashApi, flagId: string) =>
    (
        await api.get(
            `/api/v2/feature-flag/${flagId}`,
            z.object({ id: z.string(), enabled: z.boolean() }),
        )
    ).enabled;
