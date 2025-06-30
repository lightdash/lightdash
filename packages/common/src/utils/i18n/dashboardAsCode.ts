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
        z.union([
            z.object({
                type: z.union([
                    z.literal(DashboardTileTypes.SAVED_CHART),
                    z.literal(DashboardTileTypes.SQL_CHART),
                ]),
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
        ]),
    ),
});

export class DashboardAsCodeInternalization extends AsCodeInternalization<
    {
        type: 'dashboard';
        content: DashboardAsCode;
    },
    typeof dashboardAsCodeSchema
> {
    constructor(protected schema = dashboardAsCodeSchema) {
        super();
    }

    public getLanguageMap(dashboardAsCode: DashboardAsCode) {
        return {
            dashboard: {
                [dashboardAsCode.slug]: this.schema
                    .deepPartial()
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

export type DashboardAsCodeLanguageMap = ReturnType<
    DashboardAsCodeInternalization['getLanguageMap']
>;
