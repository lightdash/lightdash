import { describe, expect, it } from 'vitest';
import {
    warehouseSignInStatusQueryEnabled,
    warehouseSignInStatusQueryKey,
} from './useWarehouseSignInStatus';

describe('warehouse sign-in status query', () => {
    it('keys by project and waits for a project UUID', () => {
        expect(warehouseSignInStatusQueryKey('project-a')).toEqual([
            'warehouse-sign-in-status',
            'project-a',
        ]);
        expect(warehouseSignInStatusQueryEnabled(undefined)).toBe(false);
        expect(warehouseSignInStatusQueryEnabled('project-a')).toBe(true);
    });
});
