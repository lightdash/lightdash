import { init, type EChartsOption } from 'echarts';
import { describe, expect, it } from 'vitest';
import {
    getAxisLabelStyle,
    getAxisLineStyle,
    getAxisTitleStyle,
} from './axisStyles';
import { lightdashEchartsTheme } from './echartsTheme';
import legacyStyles from './echartsTheme.test.json';
import { getLegendStyle } from './legendStyles';
import { getTooltipStyle } from './tooltipStyles';

// Captured before moving option styles into the theme; independent of its defaults.
const normalizeSvg = (svg: string) => {
    const classNames = new Map<string, string>();
    return svg.replace(/zr\d+/g, 'zr').replace(/zr-cls-\d+/g, (name) => {
        if (!classNames.has(name))
            classNames.set(name, `cls-${classNames.size}`);
        return classNames.get(name)!;
    });
};

const render = (option: EChartsOption, themed: boolean) => {
    const chart = init(null, themed ? lightdashEchartsTheme : undefined, {
        renderer: 'svg',
        ssr: true,
        width: 640,
        height: 400,
    });
    try {
        chart.setOption(option);
        return normalizeSvg(chart.renderToSVGString());
    } finally {
        chart.dispose();
    }
};

const baseOption = (themed: boolean): EChartsOption => ({
    animation: false,
    textStyle: { fontFamily: 'Arial' },
    legend: {
        ...(!themed ? legacyStyles.legend : {}),
        itemWidth: 12,
        itemHeight: 12,
        icon: 'roundRect',
        itemStyle: { borderRadius: 3, borderWidth: 0 },
        type: 'scroll',
        selected: { Previous: false },
    },
    tooltip: {
        ...(!themed ? legacyStyles.tooltip : {}),
        renderMode: 'html',
        trigger: 'item',
    },
});

const cartesianOption = (
    themed: boolean,
    type: 'category' | 'value' | 'time' | 'log',
    customFont: boolean,
): EChartsOption => {
    const axisStyle = themed
        ? {}
        : {
              axisLabel: legacyStyles.axisLabel,
              nameTextStyle: legacyStyles.nameTextStyle,
              axisLine: legacyStyles.axisLine,
          };
    const data =
        type === 'time'
            ? [
                  [Date.UTC(2025, 0, 1), 10],
                  [Date.UTC(2025, 1, 1), 20],
                  [Date.UTC(2025, 2, 1), 15],
              ]
            : [
                  [1, 10],
                  [2, 20],
                  [3, 15],
              ];
    return {
        ...baseOption(themed),
        useUTC: true,
        xAxis: {
            ...axisStyle,
            type,
            name: 'Date / category',
            ...(type === 'category' ? { data: ['One', 'Two', 'Three'] } : {}),
            ...(customFont
                ? {
                      axisLabel: { ...axisStyle.axisLabel, fontSize: 18 },
                      nameTextStyle: {
                          ...axisStyle.nameTextStyle,
                          fontSize: 20,
                      },
                  }
                : {}),
        },
        yAxis: { ...axisStyle, type: 'value', name: 'Amount' },
        series: [
            { name: 'Current', type: 'line', data },
            { name: 'Previous', type: 'line', data },
        ],
    } as EChartsOption;
};

describe('Lightdash ECharts theme', () => {
    it('preserves inline helpers used by other renderers', () => {
        expect(getAxisLabelStyle()).toEqual(legacyStyles.axisLabel);
        expect(getAxisTitleStyle()).toEqual(legacyStyles.nameTextStyle);
        expect(getAxisLineStyle()).toEqual(legacyStyles.axisLine);
        expect(getLegendStyle()).toEqual(legacyStyles.legend);
        expect(getTooltipStyle({ appendToBody: false })).toEqual(
            legacyStyles.tooltip,
        );
    });

    it('keeps caller mutations isolated from the theme and other charts', () => {
        const legend = getLegendStyle();
        legend.textStyle.color = '#123456';
        legend.textStyle.padding[3] = 100;
        legend.pageTextStyle.color = '#654321';
        const tooltip = getTooltipStyle();
        tooltip.textStyle.color = '#abcdef';
        expect(getLegendStyle()).toEqual(legacyStyles.legend);
        expect(getTooltipStyle({ appendToBody: false })).toEqual(
            legacyStyles.tooltip,
        );
    });

    it.each(['category', 'value', 'time', 'log'] as const)(
        'preserves the SVG output of inline styles on %s axes',
        (axisType) => {
            expect(render(cartesianOption(true, axisType, false), true)).toBe(
                render(cartesianOption(false, axisType, false), false),
            );
        },
    );

    it('preserves per-axis font overrides', () => {
        expect(render(cartesianOption(true, 'category', true), true)).toBe(
            render(cartesianOption(false, 'category', true), false),
        );
    });

    it.each(['pie', 'funnel'] as const)(
        'preserves %s legends, selection, and series colors',
        (type) => {
            const option = (themed: boolean): EChartsOption => ({
                ...baseOption(themed),
                color: ['#2e65db', '#ef8235'],
                series: [
                    {
                        type,
                        data: [
                            { name: 'Current', value: 80 },
                            { name: 'Previous', value: 40 },
                        ],
                    },
                ],
            });
            expect(render(option(true), true)).toBe(
                render(option(false), false),
            );
        },
    );

    it('keeps tooltip overrides and defaults across option replacement', () => {
        const chart = init(null, lightdashEchartsTheme, {
            renderer: 'svg',
            ssr: true,
            width: 640,
            height: 400,
        });
        try {
            const option: EChartsOption = {
                tooltip: {
                    backgroundColor: '#123456',
                    textStyle: { fontSize: 19 },
                    appendToBody: false,
                },
                series: [{ type: 'pie', data: [{ name: 'One', value: 1 }] }],
            };
            chart.setOption(option);
            chart.setOption(option, { notMerge: true });
            expect(chart.getOption().tooltip).toMatchObject([
                {
                    backgroundColor: '#123456',
                    borderRadius: 8,
                    padding: 8,
                    appendToBody: false,
                    textStyle: {
                        fontSize: 19,
                        color: legacyStyles.tooltip.textStyle.color,
                    },
                },
            ]);
            expect(option.tooltip).not.toHaveProperty('borderRadius');
        } finally {
            chart.dispose();
        }
    });
});
