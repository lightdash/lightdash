import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { metricsFixture } from '../utils/adoptionFixtures';
import { ActivitySparkline } from './ActivitySparkline';

const weeks = (counts: number[]) =>
    metricsFixture(1, 0).weeklyActive.map((p, i) => ({
        ...p,
        activeUsers: counts[i],
    }));

describe('ActivitySparkline', () => {
    it('draws a plain rule when every week is zero', () => {
        const { container } = renderWithProviders(
            <ActivitySparkline points={weeks(Array(12).fill(0))} />,
        );
        expect(
            screen.getByRole('img', { name: /No activity/ }),
        ).toBeInTheDocument();
        expect(container.querySelector('line')).not.toBeNull();
        expect(container.querySelector('polyline')).toBeNull();
    });
    it('draws a 12-point line inside a fixed box when there is activity', () => {
        const { container } = renderWithProviders(
            <ActivitySparkline points={weeks([...Array(11).fill(0), 2])} />,
        );
        const svg = screen.getByRole('img', { name: /2 now/ });
        expect(svg).toHaveAttribute('viewBox', '0 0 110 30');
        const polyline = container.querySelector('polyline');
        expect(polyline?.getAttribute('points')?.split(' ')).toHaveLength(12);
    });
});
