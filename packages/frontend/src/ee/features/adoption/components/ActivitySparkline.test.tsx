import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { metricsFixture } from '../utils/adoptionFixtures';
import { getSparklinePoints } from '../utils/sparklineGeometry';
import { ActivitySparkline } from './ActivitySparkline';
import styles from './ActivitySparkline.module.css';

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
        const svg = screen.getByRole('img', { name: /2 this week so far/ });
        expect(svg).toHaveAttribute('viewBox', '0 0 110 30');
        const pointCounts = Array.from(
            container.querySelectorAll('polyline'),
            (line) => line.getAttribute('points')?.split(' ').length,
        );
        // Eleven complete weeks, then one segment into the week so far
        expect(pointCounts).toEqual([11, 2]);
    });
    it('draws the week so far as a dashed last segment ending in a hollow point', () => {
        const counts = [3, 4, 5, 4, 6, 5, 7, 6, 8, 7, 9, 2];
        const { container } = renderWithProviders(
            <ActivitySparkline points={weeks(counts)} />,
        );
        const [complete, partial] = Array.from(
            container.querySelectorAll('polyline'),
        );
        expect(complete).not.toHaveClass(styles.partialLine);
        expect(partial).toHaveClass(styles.partialLine);
        const coordinates = getSparklinePoints(counts);
        const last = coordinates[coordinates.length - 1];
        const points = container.querySelectorAll('circle');
        expect(points).toHaveLength(1);
        expect(points[0]).toHaveClass(styles.partialPoint);
        expect(points[0]).toHaveAttribute('cx', String(last.x));
        expect(points[0]).toHaveAttribute('cy', String(last.y));
    });
});
