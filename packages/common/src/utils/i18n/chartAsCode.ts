import { z } from 'zod';
import { type ChartAsCode } from '../../types/coder';
import { ChartType } from '../../types/savedCharts';
import { AsCodeInternalization } from './abstract';
import { mergeExisting } from './merge';

const chartAsCodeSchema = z.object({
    name: z.string(),
    description: z
        .string()
        .nullable()
        .optional()
        .transform((str) => str ?? undefined),

    chartConfig: z.union([
        // cartesian chart schema
        z.object({
            type: z.literal(ChartType.CARTESIAN),
            config: z
                .object({
                    eChartsConfig: z.object({
                        xAxis: z
                            .array(
                                z.object({
                                    name: z.string().optional(),
                                }),
                            )
                            .optional(),
                        yAxis: z
                            .array(
                                z.object({
                                    name: z.string().optional(),
                                }),
                            )
                            .optional(),
                        // chartConfig.config?.eChartsConfig.series[0].markLine?.data[0].name
                        series: z
                            .array(
                                z.object({
                                    name: z.string().optional(),
                                    markLine: z
                                        .object({
                                            data: z.array(
                                                z.object({
                                                    name: z.string().optional(),
                                                }),
                                            ),
                                        })
                                        .optional(),
                                }),
                            )
                            .optional(),
                    }),
                })
                .nullable()
                .optional()
                .transform((value) => value ?? undefined),
        }),

        // pie chart schema
        z.object({
            type: z.literal(ChartType.PIE),
            config: z
                .object({
                    groupLabelOverrides: z
                        .record(z.string(), z.string())
                        .optional(),
                })
                .nullable()
                .optional()
                .transform((value) => value ?? undefined),
        }),

        // funnel chart schema
        z.object({
            type: z.literal(ChartType.FUNNEL),
            config: z
                .object({
                    labelOverrides: z.record(z.string(), z.string()).optional(),
                })
                .nullable()
                .optional()
                .transform((value) => value ?? undefined),
        }),

        // big number chart schema
        z.object({
            type: z.literal(ChartType.BIG_NUMBER),
            config: z
                .object({
                    label: z.string().optional(),
                    comparisonLabel: z.string().optional(),
                })
                .nullable()
                .optional()
                .transform((value) => value ?? undefined),
        }),

        // table chart schema
        z.object({
            type: z.literal(ChartType.TABLE),
            config: z
                .object({
                    columns: z
                        .record(
                            z.string(),
                            z.object({
                                name: z.string(),
                            }),
                        )
                        .optional(),
                })
                .nullable()
                .optional()
                .transform((value) => value ?? undefined),
        }),

        // custom chart schema
        z.object({
            type: z.literal(ChartType.CUSTOM),
            config: z
                .object({
                    spec: z.record(z.unknown()).optional(),
                })
                .nullable()
                .optional()
                .transform((value) => value ?? undefined),
        }),
    ]),
});

export class ChartAsCodeInternalization extends AsCodeInternalization<
    { type: 'chart'; content: ChartAsCode },
    typeof chartAsCodeSchema
> {
    constructor(protected schema = chartAsCodeSchema) {
        super();
    }

    public getLanguageMap(chartAsCode: ChartAsCode) {
        return {
            chart: {
                [chartAsCode.slug]: this.schema
                    .deepPartial()
                    .strip()
                    .parse(chartAsCode),
            },
        };
    }

    // eslint-disable-next-line class-methods-use-this
    public merge(
        internalizationMap: ReturnType<this['getLanguageMap']>['chart'][string],
        content: ChartAsCode,
    ) {
        return mergeExisting(content, internalizationMap);
    }
}

export type ChartAsCodeLanguageMap = ReturnType<
    ChartAsCodeInternalization['getLanguageMap']
>;
