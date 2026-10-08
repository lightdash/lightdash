import {
    type EChartsOption,
    type LineSeriesOption,
    type TooltipComponentFormatterCallbackParams,
} from 'echarts';
import { useMemo, type FC } from 'react';
import EChartsReact from '../../../../components/EChartsReactWrapper';
import {
    AT_ORG_RATE,
    getWeekAxisLabels,
    getWeekLabels,
    getWeeklyChartLabel,
    getWeekTooltipRows,
    THIS_DEPARTMENT,
    type WeeklyComparisonPoint,
} from '../utils/departmentDetail';

const DEPARTMENT_COLOR = 'var(--mantine-color-text)';
const AT_ORG_RATE_COLOR = 'var(--mantine-color-dimmed)';
// Filled with the page canvas the chart sits on, so the point reads as open in either colour scheme
const HOLLOW_FILL = 'var(--ld-color-page)';

// Hover emphasis lightens the line colour, which fails for theme colour variables and hides the line
const NO_EMPHASIS: LineSeriesOption['emphasis'] = { disabled: true };

type LineData = NonNullable<LineSeriesOption['data']>;

// The week so far is not over, so its point is drawn open
const hollowPoint = (value: number, color: string): LineData[number] => ({
    value,
    symbol: 'circle',
    symbolSize: 8,
    itemStyle: { color: HOLLOW_FILL, borderColor: color, borderWidth: 2 },
});

const getDataIndex = (
    params: TooltipComponentFormatterCallbackParams,
): number | undefined =>
    (Array.isArray(params) ? params[0] : params)?.dataIndex;

const buildOption = (weeks: WeeklyComparisonPoint[]): EChartsOption => {
    const last = weeks.length - 1;
    const labels = getWeekLabels(weeks);
    const hasComparison = weeks.some((week) => week.atOrgRate !== null);
    const series: LineSeriesOption[] = [
        {
            name: THIS_DEPARTMENT,
            type: 'line',
            emphasis: NO_EMPHASIS,
            // Complete weeks only; the week so far is the dashed series below
            data: weeks.map((week, index) =>
                index < last ? week.activeUsers : null,
            ),
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: { width: 2, type: 'solid', color: DEPARTMENT_COLOR },
            itemStyle: { color: DEPARTMENT_COLOR },
        },
        {
            name: THIS_DEPARTMENT,
            type: 'line',
            emphasis: NO_EMPHASIS,
            data: weeks.map((week, index) => {
                if (index === last) {
                    return hollowPoint(week.activeUsers, DEPARTMENT_COLOR);
                }
                if (index === last - 1) {
                    return { value: week.activeUsers, symbol: 'none' };
                }
                return null;
            }),
            symbol: 'none',
            lineStyle: { width: 2, type: 'dashed', color: DEPARTMENT_COLOR },
            itemStyle: { color: DEPARTMENT_COLOR },
        },
    ];
    if (hasComparison) {
        series.push({
            name: AT_ORG_RATE,
            type: 'line',
            emphasis: NO_EMPHASIS,
            data: weeks.map((week, index) =>
                index === last && week.atOrgRate !== null
                    ? hollowPoint(week.atOrgRate, AT_ORG_RATE_COLOR)
                    : week.atOrgRate,
            ),
            symbol: 'none',
            lineStyle: { width: 2, type: 'dashed', color: AT_ORG_RATE_COLOR },
            itemStyle: { color: AT_ORG_RATE_COLOR },
        });
    }

    return {
        animation: false,
        grid: { left: 36, right: 16, top: 32, bottom: 40 },
        legend: {
            top: 0,
            left: 0,
            data: hasComparison
                ? [THIS_DEPARTMENT, AT_ORG_RATE]
                : [THIS_DEPARTMENT],
        },
        tooltip: {
            trigger: 'axis',
            // Built from the weeks, as the week so far is split across two series
            formatter: (params) => {
                const index = getDataIndex(params);
                if (index === undefined || index > last) return '';
                return getWeekTooltipRows(weeks[index], labels[index]).join(
                    '<br/>',
                );
            },
        },
        xAxis: {
            type: 'category',
            boundaryGap: false,
            data: getWeekAxisLabels(weeks),
            axisLabel: {
                // The week so far is always named, kept inside the chart's right edge
                showMaxLabel: true,
                alignMaxLabel: 'right',
            },
        },
        yAxis: { type: 'value', min: 0, minInterval: 1 },
        series,
    };
};

export const WeeklyActiveChart: FC<{ weeks: WeeklyComparisonPoint[] }> = ({
    weeks,
}) => {
    const option = useMemo(() => buildOption(weeks), [weeks]);

    return (
        <div role="img" aria-label={getWeeklyChartLabel(weeks)}>
            <EChartsReact
                option={option}
                notMerge
                opts={{ renderer: 'svg' }}
                style={{ height: 260, width: '100%' }}
            />
        </div>
    );
};
