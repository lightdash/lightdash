import * as echarts from 'echarts';
import { describe, expect, test } from 'vitest';
import { FUNNEL_SERIES_DEFAULTS } from './useEchartsFunnelConfig';

/**
 * A funnel's step order is meaningful and independent of size — a signup flow,
 * an onboarding path, a sales pipeline in stage order. These steps deliberately
 * do not descend by value, so any sorting by ECharts is visible.
 */
const steps = [
    { name: 'Visited', value: 1000 },
    { name: 'Signed up', value: 200 },
    { name: 'Activated', value: 600 },
    { name: 'Paid', value: 100 },
];

const renderedStepOrder = (series: Record<string, unknown>) => {
    const chart = echarts.init(null, null, {
        renderer: 'svg',
        ssr: true,
        width: 400,
        height: 300,
    });
    chart.setOption({
        series: [
            {
                data: steps,
                label: { show: true, position: 'inside', formatter: '{b}' },
                ...series,
            },
        ],
    });
    const svg = chart.renderToSVGString();
    chart.dispose();

    const names = steps.map((s) => s.name);
    return [...svg.matchAll(/<text[^>]*y="([\d.]+)"[^>]*>([^<]*)<\/text>/g)]
        .map((match) => ({ y: Number(match[1]), text: match[2].trim() }))
        .filter((label) => names.includes(label.text))
        .sort((a, b) => a.y - b.y)
        .map((label) => label.text);
};

describe('funnel series', () => {
    test('renders steps in the order the query returned them', () => {
        expect(renderedStepOrder(FUNNEL_SERIES_DEFAULTS)).toEqual(
            steps.map((s) => s.name),
        );
    });

    test('ECharts re-orders by value without the `sort` option, which is why it is set', () => {
        // Guards the fix: if `sort` is dropped from the defaults, the test
        // above starts matching this order instead.
        expect(renderedStepOrder({ type: 'funnel' })).toEqual([
            'Visited',
            'Activated',
            'Signed up',
            'Paid',
        ]);
    });
});
