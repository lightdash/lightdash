import { describe, expect, it } from 'vitest';
import { groupExploreFields } from '../groupExploreFields';

it('groups dimensions, metrics, time dimensions', () => {
    const result = groupExploreFields({
        tables: {
            orders: {
                dimensions: [
                    { name: 'orders.status', label: 'Status', type: 'string' },
                ],
                metrics: [
                    {
                        name: 'orders.total_revenue',
                        label: 'Revenue',
                        type: 'number',
                    },
                ],
                timeDimensions: [
                    { name: 'orders.created_date', label: 'Created Date' },
                ],
            },
        },
    } as any);

    expect(result.dimensions.length).toBe(1);
    expect(result.metrics.length).toBe(1);
    expect(result.timeDimensions.length).toBe(1);
});
