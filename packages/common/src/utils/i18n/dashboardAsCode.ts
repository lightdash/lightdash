import { z } from 'zod';
import { type DashboardAsCode } from '../../types/coder';
import { DashboardTileTypes } from '../../types/dashboard';
import { AsCodeInternalization } from './abstract';
import { mergeExisting } from './merge';

const dashboardAsCodeSchema = z.object({
    name: z.string(),
    description: z
        .string()
        .nullable()
        .optional()
        .transform((str) => str ?? undefined),
    tiles: z.array(
        z
            .union([
                z.object({
                    type: z.literal(DashboardTileTypes.SAVED_CHART),
                    properties: z.object({
                        title: z.string(),
                        chartName: z.string().optional().default(''),
                    }),
                }),
                z.object({
                    type: z.literal(DashboardTileTypes.SQL_CHART),
                    properties: z.object({
                        title: z.string(),
                        chartName: z.string().optional().default(''),
                    }),
                }),
                z.object({
                    type: z.literal(DashboardTileTypes.SEMANTIC_VIEWER_CHART),
                    properties: z.object({
                        title: z.string(),
                        chartName: z.string().optional().default(''),
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

export class DashboardAsCodeInternalization extends AsCodeInternalization<
    {
        type: 'dashboard';
        content: DashboardAsCode;
    },
    typeof dashboardAsCodeSchema
> {
    constructor(protected _schema = dashboardAsCodeSchema) {
        super();
    }

    protected getSchema() {
        // eslint-disable-next-line no-underscore-dangle
        return this._schema.deepPartial();
    }

    public getLanguageMap(dashboardAsCode: DashboardAsCode) {
        return {
            dashboard: {
                [dashboardAsCode.slug]: this.getSchema()
                    .strip()
                    .parse(dashboardAsCode),
            },
        };
    }

    // eslint-disable-next-line class-methods-use-this
    public merge(
        internalizationMap: ReturnType<
            this['getLanguageMap']
        >['dashboard'][string],
        content: DashboardAsCode,
    ) {
        return mergeExisting(content, internalizationMap);
    }
}
