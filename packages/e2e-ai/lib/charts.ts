import { z } from 'zod';
import { projectUuid } from './agents';
import type { LightdashApi } from './api';
import { single } from './assert';

/** A seeded saved chart by its exact name. */
export const seededChart = async (api: LightdashApi, name: string) =>
    single(
        (
            await api.get(
                `/api/v1/projects/${projectUuid}/charts`,
                z.array(z.object({ uuid: z.string(), name: z.string() })),
            )
        ).filter((chart) => chart.name === name),
        `seeded chart "${name}"`,
    );
