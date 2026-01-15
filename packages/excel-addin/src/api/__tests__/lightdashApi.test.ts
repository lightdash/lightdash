import { describe, expect, it } from 'vitest';
import { normalizeMetricQuery } from '../lightdashApi';

it('normalizes empty filters/sorts', () => {
    const result = normalizeMetricQuery({ metrics: [], dimensions: [] });
    expect(result.filters).toBeUndefined();
    expect(result.sorts).toBeUndefined();
});
