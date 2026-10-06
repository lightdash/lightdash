import { DbtProjectType, WarehouseTypes } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { dbtDefaults } from '../DbtForms/defaultValues';
import { type ProjectConnectionForm } from '../types';
import { SnowflakeDefaultValues } from './defaultValues';
import {
    createWarehouseValueValidators,
    warehouseValueValidators,
} from './validators';

const values: ProjectConnectionForm = {
    name: 'Test',
    dbt: { type: DbtProjectType.NONE },
    warehouse: SnowflakeDefaultValues,
    dbtVersion: dbtDefaults.dbtVersion,
};

describe.each([warehouseValueValidators, createWarehouseValueValidators])(
    'Snowflake procedure validation',
    (validators) => {
        it.each([
            '',
            'DB.SCHEMA.PROCEDURE',
            ' DB.SCHEMA.PROCEDURE ',
            '"Data base"."A.B"."run""sql"',
        ])('accepts %j', (value) => {
            expect(
                validators[WarehouseTypes.SNOWFLAKE].aiQueryProcedure(
                    value,
                    values,
                ),
            ).toBeUndefined();
        });

        it.each([
            ' ',
            'SCHEMA.PROCEDURE',
            'DB.SCHEMA.PROCEDURE.EXTRA',
            'DB.SCHEMA.PROCEDURE(); SELECT 1',
        ])('rejects %j', (value) => {
            expect(
                validators[WarehouseTypes.SNOWFLAKE].aiQueryProcedure(
                    value,
                    values,
                ),
            ).toBe('Enter database.schema.procedure');
        });
    },
);
