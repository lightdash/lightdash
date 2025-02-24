import { type PartialDeep } from 'type-fest';
import { z } from 'zod';
import { type DashboardAsCode } from '../../types/coder';
import { DashboardTileTypes } from '../../types/dashboard';
import { type AsCodeInternalization } from './abstract';

export class DashboardAsCodeInternalization
    implements AsCodeInternalization<DashboardAsCode>
{
    schema = z.object({
        name: z.string(),
        description: z.string().nullable(),
        tiles: z.array(
            z
                .union([
                    z.object({
                        type: z.literal(DashboardTileTypes.SAVED_CHART),
                        properties: z.object({
                            title: z.string(),
                            // chartName: z.string(),
                        }),
                    }),
                    z.object({
                        type: z.literal(DashboardTileTypes.SQL_CHART),
                        properties: z.object({
                            title: z.string(),
                            // chartName: z.string(),
                        }),
                    }),
                    z.object({
                        type: z.literal(
                            DashboardTileTypes.SEMANTIC_VIEWER_CHART,
                        ),
                        properties: z.object({
                            title: z.string(),
                            // chartName: z.string(),
                        }),
                    }),
                    z.object({
                        type: z.literal(DashboardTileTypes.MARKDOWN),
                        properties: z.object({
                            title: z.string(),
                            content: z.string(),
                        }),
                    }),
                    z.object({
                        type: z.literal(DashboardTileTypes.LOOM),
                        properties: z.object({
                            title: z.string(),
                        }),
                    }),
                ])
                .transform((tile) => ({ properties: { ...tile.properties } })),
        ),
    });

    private getToleratedSchema() {
        return this.schema.deepPartial().strip();
    }

    public parse(dashboardAsCode: DashboardAsCode) {
        return this.getToleratedSchema().parse(
            dashboardAsCode,
        ) as PartialDeep<DashboardAsCode>; // TODO: fix this
    }
}
