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
                        xAxis: z.array(
                            z.object({
                                name: z.string(),
                            }),
                        ),
                        yAxis: z.array(
                            z.object({
                                name: z.string(),
                            }),
                        ),
                        // chartConfig.config?.eChartsConfig.series[0].markLine?.data[0].name
                        series: z.array(
                            z.object({
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
                        ),
                    }),
                })
                .optional(),
        }),

        // pie chart schema
        z.object({
            type: z.literal(ChartType.PIE),
            config: z.object({
                groupLabelOverrides: z.record(z.string(), z.string()),
            }),
        }),

        // funnel chart schema
        z.object({
            type: z.literal(ChartType.FUNNEL),
            config: z.object({
                labelOverrides: z.record(z.string(), z.string()),
            }),
        }),

        // big number chart schema
        z.object({
            type: z.literal(ChartType.BIG_NUMBER),
            config: z.object({
                label: z.string(),
                comparisonLabel: z.string(),
            }),
        }),

        // table chart schema
        z.object({
            type: z.literal(ChartType.TABLE),
            config: z.object({
                columns: z.record(
                    z.string(),
                    z.object({
                        name: z.string(),
                    }),
                ),
            }),
        }),
    ]),
});

export class ChartAsCodeInternalization extends AsCodeInternalization<
    { type: 'chart'; content: ChartAsCode },
    typeof chartAsCodeSchema
> {
    constructor(protected _schema = chartAsCodeSchema) {
        super();
    }

    protected getSchema() {
        // eslint-disable-next-line no-underscore-dangle
        return this._schema.deepPartial();
    }

    public getLanguageMap(chartAsCode: ChartAsCode) {
        return {
            chart: {
                [chartAsCode.slug]: this.getSchema().strip().parse(chartAsCode),
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
