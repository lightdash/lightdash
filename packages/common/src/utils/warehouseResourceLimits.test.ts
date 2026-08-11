import { describe, expect, it } from 'vitest';
import { isWarehouseResourceLimitError } from './warehouseResourceLimits';

describe('isWarehouseResourceLimitError', () => {
    it.each([
        'BigQuery error: bytesBilledLimitExceeded',
        'Query exceeded limit for bytes billed: 50000000000',
        'Warehouse resource exhausted: memory limit exceeded',
    ])('recognizes warehouse resource limits: %s', (message) => {
        expect(isWarehouseResourceLimitError(message)).toBe(true);
    });

    it('does not classify unrelated query errors', () => {
        expect(
            isWarehouseResourceLimitError('Access denied for table orders'),
        ).toBe(false);
    });
});
