import { formatItemValue, ResultRow, ResultValue } from '@lightdash/common';
import { EChartsOption, PieSeriesOption } from 'echarts';
import { VisualizationConfigPie } from '../../components/LightdashVisualization/VisualizationProvider';

export type PieSeriesDataPoint = NonNullable<
    PieSeriesOption['data']
>[number] & {
    meta: {
        value: ResultValue;
        rows: ResultRow[];
    };
};

const getEchartsPieConfig = (
    pieVisualizationConfig: VisualizationConfigPie,
    options: {
        animation: boolean;
    } = {
        animation: true,
    },
) => {
    const {
        groupColorDefaults,
        selectedMetric,
        data,
        sortedGroupLabels,
        validPieChartConfig: {
            isDonut,
            valueLabel: valueLabelDefault,
            showValue: showValueDefault,
            showPercentage: showPercentageDefault,
            groupLabelOverrides,
            groupColorOverrides,
            groupValueOptionOverrides,
            showLegend,
            legendPosition,
        },
    } = pieVisualizationConfig;

    if (!data || data.length === 0) {
        return undefined;
    }

    const seriesData = data
        .sort(
            ({ name: nameA }, { name: nameB }) =>
                sortedGroupLabels.indexOf(nameA) -
                sortedGroupLabels.indexOf(nameB),
        )
        .map(({ name, value, meta }) => {
            const valueLabel =
                groupValueOptionOverrides?.[name]?.valueLabel ??
                valueLabelDefault;
            const showValue =
                groupValueOptionOverrides?.[name]?.showValue ??
                showValueDefault;
            const showPercentage =
                groupValueOptionOverrides?.[name]?.showPercentage ??
                showPercentageDefault;

            const config: PieSeriesDataPoint = {
                id: name,
                groupId: name,
                name: groupLabelOverrides?.[name] ?? name,
                value: value,
                itemStyle: {
                    color:
                        groupColorOverrides?.[name] ??
                        groupColorDefaults?.[name],
                },
                label: {
                    show: valueLabel !== 'hidden',
                    position: valueLabel === 'outside' ? 'outside' : 'inside',
                    formatter: (params) => {
                        return valueLabel !== 'hidden' &&
                            showValue &&
                            showPercentage
                            ? `${params.percent}% - ${meta.value.formatted}`
                            : showValue
                            ? `${meta.value.formatted}`
                            : showPercentage
                            ? `${params.percent}%`
                            : `${params.name}`;
                    },
                },
                meta,
            };

            return config;
        });

    const pieSeriesOption: PieSeriesOption = {
        type: 'pie',
        data: seriesData,
        radius: isDonut ? ['30%', '70%'] : '70%',
        center:
            legendPosition === 'horizontal'
                ? showLegend &&
                  valueLabelDefault === 'outside' &&
                  (showValueDefault || showPercentageDefault)
                    ? ['50%', '55%']
                    : showLegend
                    ? ['50%', '52%']
                    : ['50%', '50%']
                : ['50%', '50%'],
        tooltip: {
            trigger: 'item',
            formatter: ({ marker, name, value, percent }) => {
                const formattedValue = formatItemValue(selectedMetric, value);

                return `${marker} <b>${name}</b><br />${percent}% - ${formattedValue}`;
            },
        },
    };

    const eChartsOption: EChartsOption = {
        legend: {
            show: showLegend,
            orient: legendPosition,
            type: 'scroll',
            ...(legendPosition === 'vertical'
                ? {
                      left: 'left',
                      top: 'middle',
                      align: 'left',
                  }
                : {
                      left: 'center',
                      top: 'top',
                      align: 'auto',
                  }),
        },
        tooltip: {
            trigger: 'item',
        },
        series: [pieSeriesOption],
        animation: options.animation,
    };

    return { eChartsOption, pieSeriesOption };
};

export default getEchartsPieConfig;
