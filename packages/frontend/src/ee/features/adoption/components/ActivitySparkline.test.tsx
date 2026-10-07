import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { metricsFixture } from '../utils/adoptionFixtures';
import { ActivitySparkline } from './ActivitySparkline';

const echarts = vi.fn(() => <div data-testid="echarts" />);
vi.mock('../../../../components/EChartsReactWrapper', () => ({
    default: () => echarts(),
}));

describe('ActivitySparkline', () => {
    it('draws a plain rule, not a chart, when every week is zero', () => {
        renderWithProviders(
            <ActivitySparkline points={metricsFixture(1, 0).weeklyActive} />,
        );
        expect(
            screen.getByRole('img', { name: /No activity/ }),
        ).toBeInTheDocument();
        expect(screen.queryByTestId('echarts')).not.toBeInTheDocument();
    });
    it('uses the chart when there is activity', () => {
        const points = metricsFixture(1, 0).weeklyActive.map((p, i) => ({
            ...p,
            activeUsers: i,
        }));
        renderWithProviders(<ActivitySparkline points={points} />);
        expect(screen.getByTestId('echarts')).toBeInTheDocument();
    });
});
