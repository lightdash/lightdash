import { screen } from '@testing-library/react';
import { type EChartsOption } from 'echarts';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { type WeeklyComparisonPoint } from '../utils/departmentDetail';
import { WeeklyActiveChart } from './WeeklyActiveChart';

const { chart } = vi.hoisted(() => ({
    chart: { option: null as EChartsOption | null },
}));
vi.mock('../../../../components/EChartsReactWrapper', () => ({
    default: ({ option }: { option: EChartsOption }) => {
        chart.option = option;
        return null;
    },
}));

const DEPARTMENT = 'This department';
const AT_ORG_RATE = "At the organization's rate";
// The chart sits on the page canvas, so an open point is filled with it
const HOLLOW = { color: 'var(--ld-color-page)' };

const weeks = (
    counts: number[],
    rates: (number | null)[],
): WeeklyComparisonPoint[] =>
    counts.map((activeUsers, i) => ({
        weekStart: new Date(Date.UTC(2026, 6, 20 + 7 * i))
            .toISOString()
            .slice(0, 10),
        activeUsers,
        atOrgRate: rates[i],
    }));

const seriesNamed = (name: string) => {
    const series = chart.option?.series;
    return (Array.isArray(series) ? series : []).filter(
        (item) => item.name === name,
    );
};

const renderChart = (points: WeeklyComparisonPoint[]) => {
    chart.option = null;
    renderWithProviders(<WeeklyActiveChart weeks={points} />);
};

describe('WeeklyActiveChart', () => {
    it('names both lines in the legend', () => {
        renderChart(weeks([5, 6, 7], [4.5, 5, 5.5]));
        expect(chart.option?.legend).toMatchObject({
            data: [DEPARTMENT, AT_ORG_RATE],
        });
    });

    it("draws the organization's rate for this department as a dashed line", () => {
        renderChart(weeks([5, 6, 7], [4.5, 5, 5.5]));
        const [comparison] = seriesNamed(AT_ORG_RATE);
        expect(comparison).toMatchObject({
            type: 'line',
            lineStyle: { type: 'dashed' },
        });
        expect(comparison.data).toMatchObject([4.5, 5, { value: 5.5 }]);
    });

    it('draws the week so far with a dashed last segment and a hollow last point', () => {
        renderChart(weeks([5, 6, 7], [4.5, 5, 5.5]));
        const [complete, partial] = seriesNamed(DEPARTMENT);
        // Complete weeks: a solid line that stops before the week so far
        expect(complete).toMatchObject({ lineStyle: { type: 'solid' } });
        expect(complete.data).toEqual([5, 6, null]);
        // The week so far: a dashed segment from the last complete week
        expect(partial).toMatchObject({ lineStyle: { type: 'dashed' } });
        expect(partial.data).toMatchObject([
            null,
            { value: 6, symbol: 'none' },
            { value: 7, symbol: 'circle', itemStyle: HOLLOW },
        ]);
        // The comparison's last point is hollow too
        const [comparison] = seriesNamed(AT_ORG_RATE);
        expect(comparison.data).toMatchObject([
            4.5,
            5,
            { value: 5.5, symbol: 'circle', itemStyle: HOLLOW },
        ]);
    });

    it('keeps every line drawn while hovering', () => {
        // A hover emphasis lightens the colour, which fails for theme colour variables and hides the line
        renderChart(weeks([5, 6, 7], [4.5, 5, 5.5]));
        const series = chart.option?.series;
        expect(Array.isArray(series) ? series : []).toHaveLength(3);
        (Array.isArray(series) ? series : []).forEach((item) =>
            expect(item).toMatchObject({ emphasis: { disabled: true } }),
        );
    });

    it('labels the last week on the axis as the week so far', () => {
        renderChart(weeks([5, 6, 7], [4.5, 5, 5.5]));
        expect(chart.option?.xAxis).toMatchObject({
            data: ['20 Jul', '27 Jul', 'This week\nso far'],
            axisLabel: { showMaxLabel: true, alignMaxLabel: 'right' },
        });
    });

    it('draws only this department until the organization numbers arrive', () => {
        renderChart(weeks([5, 6, 7], [null, null, null]));
        expect(seriesNamed(AT_ORG_RATE)).toHaveLength(0);
        expect(chart.option?.legend).toMatchObject({ data: [DEPARTMENT] });
    });

    it('marks a single week as the week so far', () => {
        renderChart(weeks([3], [2.5]));
        const [complete, partial] = seriesNamed(DEPARTMENT);
        expect(complete.data).toEqual([null]);
        expect(partial.data).toMatchObject([{ value: 3, symbol: 'circle' }]);
    });

    it('describes both lines in words', () => {
        renderChart(weeks([5, 6, 7], [4.5, 5, 5.5]));
        expect(
            screen.getByRole('img', {
                name: "Weekly active people over 3 weeks: this department had 5 at the start and 7 this week so far, against 4.5 and 5.5 at the organization's rate",
            }),
        ).toBeInTheDocument();
    });
});
