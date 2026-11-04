import { WarehouseTypes } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { isDbtStepField } from './util';

describe('isDbtStepField', () => {
    it.each([
        [WarehouseTypes.BIGQUERY, 'warehouse.dataset'],
        [WarehouseTypes.DATABRICKS, 'warehouse.database'],
        [WarehouseTypes.POSTGRES, 'warehouse.schema'],
        [WarehouseTypes.SNOWFLAKE, 'warehouse.schema'],
    ])('treats the %s schema field as part of the dbt step', (type, path) => {
        expect(isDbtStepField(path, type)).toBe(true);
        expect(isDbtStepField('dbt.repository', type)).toBe(true);
    });

    it('keeps other warehouse fields on the warehouse step', () => {
        expect(
            isDbtStepField('warehouse.schema', WarehouseTypes.BIGQUERY),
        ).toBe(false);
        expect(
            isDbtStepField('warehouse.project', WarehouseTypes.BIGQUERY),
        ).toBe(false);
        expect(
            isDbtStepField('warehouse.database', WarehouseTypes.POSTGRES),
        ).toBe(false);
    });
});
