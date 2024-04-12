import {
    CartesianSeriesType,
    getResultValueArray,
    getSeriesId,
    hashFieldReference,
    type Series,
} from '@lightdash/common';
import type { EChartSeries } from '../../../../hooks/echarts/useEchartsCartesianConfig';
import { VizLibDto } from './VizLibDto';

export class EchartsDto extends VizLibDto {
    static type = 'echarts' as const;

    public getType() {
        return EchartsDto.type;
    }

    public getVizOptions() {
        return ['bar', 'line'];
    }

    public getConfig() {
        const config = {
            xAxis: this.getXAxis(),
            yAxis: this.getYAxis(),
            useUTC: true,
            series: this.getSeries(),
            dataset: this.getDataSet(),
        };
        return config;
    }

    private getXAxis() {
        return {
            type: 'category',
            name: this.vizConfig?.xField,
            nameLocation: 'center',
            nameTextStyle: {
                fontWeight: 'bold',
            },
        };
    }

    private getYAxis() {
        return {
            type: 'value',
            name: this.vizConfig?.yFields?.[0],
            nameLocation: 'center',
            nameTextStyle: {
                fontWeight: 'bold',
            },
        };
    }

    private getSeries() {
        const xField = this.vizConfig?.xField;
        const yFields = this.vizConfig?.yFields;
        const vizType = this.vizConfig?.vizType ?? CartesianSeriesType.BAR;

        if (!xField) {
            return [];
        }

        // generate series
        const expectedSeriesMap = (yFields || []).reduce<
            Record<string, Series>
        >((sum, yField) => {
            const series: Series = {
                type: vizType as CartesianSeriesType,
                encode: {
                    xRef: { field: xField },
                    yRef: { field: yField },
                },
            };
            return { ...sum, [getSeriesId(series)]: series };
        }, {});

        // convert to echarts series
        return Object.values(expectedSeriesMap).map<EChartSeries>((series) => {
            const xFieldHash = hashFieldReference(series.encode.xRef);
            const yFieldHash = hashFieldReference(series.encode.yRef);

            return this.getSimpleSeries({
                series,
                yFieldHash,
                xFieldHash,
            });
        });
    }

    private getSimpleSeries({
        series,
        yFieldHash,
        xFieldHash,
    }: {
        series: Series;
        yFieldHash: string;
        xFieldHash: string;
    }) {
        return {
            ...series,
            xAxisIndex: undefined,
            yAxisIndex: series.yAxisIndex,
            emphasis: {
                focus: 'series',
            },
            connectNulls: true,
            encode: {
                ...series.encode,
                x: xFieldHash,
                y: yFieldHash,
                tooltip: [yFieldHash],
                seriesName: yFieldHash,
            },
            labelLayout: {
                hideOverlap: true,
            },
        };
    }

    private getDataSet() {
        return {
            id: 'lightdash-results',
            source: getResultValueArray(this.sourceDto.getRows(), true),
        };
    }
}
