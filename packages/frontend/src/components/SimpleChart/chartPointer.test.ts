import { init } from 'echarts';
import { describe, expect, test } from 'vitest';
import { CARTESIAN_HOVER_EMPHASIS } from '../../hooks/echarts/useEchartsCartesianConfig';
import { SERIES_FOCUS_ACTION } from './chartSeriesFocus';
import { CHART_POINTER_OPTIONS } from './chartTooltipController';

describe('dense bar pointer targets', () => {
    test('bridges narrow bar gaps while keeping real whitespace available', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const chart = init(container, undefined, {
            renderer: 'svg',
            width: 200,
            height: 200,
            ...CHART_POINTER_OPTIONS,
        });
        try {
            chart.setOption({
                animation: false,
                grid: { left: 0, right: 0, top: 0, bottom: 0 },
                xAxis: { type: 'category', data: ['A', 'B'], show: false },
                yAxis: { type: 'value', min: 0, max: 10, show: false },
                series: [{ type: 'bar', data: [5, 5], barCategoryGap: '4%' }],
            });
            const zr = chart.getZr();
            // The bars finish at x=98 and start at x=102. The visual gap
            // should still target a nearby bar, including during slow motion.
            expect(zr.findHover(100, 150)?.target).toBeDefined();
            // Genuine whitespace above the bars remains an axis-tooltip area.
            expect(zr.findHover(100, 40)?.target).toBeUndefined();
        } finally {
            chart.dispose();
            container.remove();
        }
    });
});

describe('stacked chart hover painting', () => {
    test.each([1, 0.6])(
        'keeps focus steady and preserves authored opacity %s',
        async (opacity) => {
            const container = document.createElement('div');
            document.body.appendChild(container);
            const chart = init(container, undefined, {
                renderer: 'svg',
                width: 200,
                height: 200,
                ...CHART_POINTER_OPTIONS,
            });
            try {
                chart.setOption({
                    animation: false,
                    stateAnimation: { duration: 0 },
                    grid: { left: 0, right: 0, top: 0, bottom: 0 },
                    xAxis: {
                        type: 'category',
                        data: ['A', 'B', 'C', 'D'],
                        show: false,
                    },
                    yAxis: { type: 'value', min: 0, max: 100, show: false },
                    tooltip: { trigger: 'axis', showContent: false },
                    series: [
                        {
                            data: [20, 20, 20, 20],
                            color: '#7950f2',
                            itemStyle: { opacity },
                        },
                        { data: [5, 5, 5, 5], color: '#228be6' },
                        { data: [40, 12, 35, 40], color: '#10b981' },
                    ].map((series) => ({
                        ...series,
                        type: 'bar',
                        stack: 'total',
                        barCategoryGap: '4%',
                        emphasis: CARTESIAN_HOVER_EMPHASIS,
                    })),
                });
                const zr = chart.getZr();
                chart.dispatchAction({
                    type: SERIES_FOCUS_ACTION,
                    seriesIndex: 2,
                });
                for (const x of [25, 50, 75, 125, 150, 175]) {
                    // Actual ECharts event ordering + a painted frame, including
                    // whitespace over a short stack (x=75), not just hit testing.
                    zr.handler.dispatch('mousemove', { zrX: x, zrY: 110 });
                    await new Promise((resolve) => setTimeout(resolve, 30));
                    zr.flush();
                    const purple = [
                        ...container.querySelectorAll('path[fill="#7950f2"]'),
                    ];
                    expect(purple.length).toBeGreaterThan(0);
                    expect(
                        purple.map(
                            (path) => path.getAttribute('fill-opacity') ?? '1',
                        ),
                    ).toEqual(purple.map(() => String(opacity * 0.22)));
                    const green = [
                        ...container.querySelectorAll('path[fill="#10b981"]'),
                    ];
                    expect(green.length).toBeGreaterThan(0);
                    expect(
                        green.map(
                            (path) => path.getAttribute('fill-opacity') ?? '1',
                        ),
                    ).toEqual(green.map(() => '1'));
                }
                chart.dispatchAction({
                    type: SERIES_FOCUS_ACTION,
                    seriesIndex: 0,
                });
                zr.flush();
                const nowMuted = [
                    ...container.querySelectorAll('path[fill="#10b981"]'),
                ];
                expect(nowMuted.length).toBeGreaterThan(0);
                expect(
                    nowMuted.map(
                        (path) => path.getAttribute('fill-opacity') ?? '1',
                    ),
                ).toEqual(nowMuted.map(() => '0.22'));
                chart.dispatchAction({
                    type: SERIES_FOCUS_ACTION,
                    seriesIndex: null,
                });
                zr.flush();
                const restored = [
                    ...container.querySelectorAll('path[fill="#7950f2"]'),
                ];
                expect(restored.length).toBeGreaterThan(0);
                expect(
                    restored.map(
                        (path) => path.getAttribute('fill-opacity') ?? '1',
                    ),
                ).toEqual(restored.map(() => String(opacity)));
            } finally {
                chart.dispose();
                container.remove();
            }
        },
    );

    test('keeps authored opacity when focus moves during state animation', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const chart = init(container, undefined, {
            renderer: 'svg',
            width: 200,
            height: 200,
            ...CHART_POINTER_OPTIONS,
        });
        const opacityOf = (fill: string) =>
            [...container.querySelectorAll(`path[fill="${fill}"]`)].map(
                (path) => path.getAttribute('fill-opacity') ?? '1',
            );
        try {
            chart.setOption({
                animation: false,
                grid: { left: 0, right: 0, top: 0, bottom: 0 },
                xAxis: {
                    type: 'category',
                    data: ['A', 'B', 'C', 'D'],
                    show: false,
                },
                yAxis: { type: 'value', min: 0, max: 100, show: false },
                tooltip: { trigger: 'axis', showContent: false },
                series: [
                    {
                        data: [20, 20, 20, 20],
                        color: '#7950f2',
                        itemStyle: { opacity: 0.6 },
                    },
                    { data: [5, 5, 5, 5], color: '#228be6' },
                    { data: [40, 12, 35, 40], color: '#10b981' },
                ].map((series) => ({
                    ...series,
                    type: 'bar',
                    stack: 'total',
                    barCategoryGap: '4%',
                    emphasis: CARTESIAN_HOVER_EMPHASIS,
                })),
            });
            const zr = chart.getZr();
            // Node disables chart animation, so state transitions never attach.
            // Browsers do, and that is what decays opacity while hovering a stack.
            zr.storage.traverse((element) => {
                element.stateTransition = { duration: 300, easing: 'cubicOut' };
            });
            for (const seriesIndex of [2, 0, 1, 2]) {
                chart.dispatchAction({
                    type: SERIES_FOCUS_ACTION,
                    seriesIndex,
                });
                zr.flush();
            }
            await new Promise((resolve) => setTimeout(resolve, 400));
            zr.flush();
            expect(opacityOf('#7950f2')).toEqual([
                '0.132',
                '0.132',
                '0.132',
                '0.132',
            ]);
            expect(opacityOf('#228be6')).toEqual([
                '0.22',
                '0.22',
                '0.22',
                '0.22',
            ]);
            expect(opacityOf('#10b981')).toEqual(['1', '1', '1', '1']);
            chart.dispatchAction({
                type: SERIES_FOCUS_ACTION,
                seriesIndex: null,
            });
            await new Promise((resolve) => setTimeout(resolve, 400));
            zr.flush();
            expect(opacityOf('#7950f2')).toEqual(['0.6', '0.6', '0.6', '0.6']);
            expect(opacityOf('#228be6')).toEqual(['1', '1', '1', '1']);
            expect(opacityOf('#10b981')).toEqual(['1', '1', '1', '1']);
        } finally {
            chart.dispose();
            container.remove();
        }
    });
});
