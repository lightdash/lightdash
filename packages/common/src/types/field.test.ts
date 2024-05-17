import { getItemId } from '../utils/item';
import {
    BinType,
    convertFieldRefToFieldId,
    CustomDimensionType,
    DimensionType,
    MetricType,
    type CustomBinDimension,
    type CustomSqlDimension,
    type TableCalculation,
} from './field';
import { type AdditionalMetric } from './metricQuery';

describe('field util functions', () => {
    describe('convertFieldRefToFieldId', () => {
        it('should convert field references to field ids', async () => {
            expect(convertFieldRefToFieldId('table.field')).toEqual(
                'table_field',
            );
            expect(convertFieldRefToFieldId('table.field', 'fallback')).toEqual(
                'table_field',
            );
            expect(convertFieldRefToFieldId('field', 'fallback')).toEqual(
                'fallback_field',
            );
        });
        it('should throw error when field reference doesnt have a table and there is no fallback', async () => {
            expect(() => convertFieldRefToFieldId('field')).toThrowError(
                'Table calculation contains an invalid reference: field. References must be of the format "table.field"',
            );
        });
    });
    describe('getItemId', () => {
        it('should return item id based on table and name', async () => {
            expect(getItemId({ table: 'table', name: 'field' })).toEqual(
                'table_field',
            );
            expect(getItemId({ table: 'table', name: 'field.nested' })).toEqual(
                'table_field__nested',
            );
            expect(getItemId({ table: 'table', name: 'field_test' })).toEqual(
                'table_field_test',
            );
            expect(getItemId({ table: 'table_test', name: 'field' })).toEqual(
                'table_test_field',
            );
            expect(
                getItemId({ table: 'table_test', name: 'field_test' }),
            ).toEqual('table_test_field_test');
            expect(
                getItemId({ table: 'table_test', name: 'field.nested' }),
            ).toEqual('table_test_field__nested');
            expect(
                getItemId({ table: 'table_test', name: 'field_test.nested' }),
            ).toEqual('table_test_field_test__nested');
        });
        it('should return item id for custom dimensions', async () => {
            const bin: CustomBinDimension = {
                id: 'custom_dimension_id',
                name: 'custom_dimension_name',
                type: CustomDimensionType.BIN,
                dimensionId: 'table1_dim1', // Parent dimension id
                binType: BinType.FIXED_NUMBER,
                binNumber: 5,
                table: 'table1',
            };
            expect(getItemId(bin)).toEqual('custom_dimension_id');
            const customSqlDimension: CustomSqlDimension = {
                id: 'custom_dimension_id',
                name: 'custom_dimension_name',
                type: CustomDimensionType.SQL,
                table: 'table1',
                sql: 'example',
                dimensionType: DimensionType.STRING,
            };
            expect(getItemId(customSqlDimension)).toEqual(
                'custom_dimension_id',
            );
        });
        it('should return item id for table calculation', async () => {
            const tc: TableCalculation = {
                name: 'calc2',
                displayName: '',
                sql: 'dim reference ${table1.dim1}',
            };
            expect(getItemId(tc)).toEqual('calc2');
        });
        it('should return item id for table calculation', async () => {
            const tc: TableCalculation = {
                name: 'calc2',
                displayName: '',
                sql: 'dim reference ${table1.dim1}',
            };
            expect(getItemId(tc)).toEqual('calc2');
        });
        it('should return item id for additional metric', async () => {
            const additionalMetric: AdditionalMetric = {
                type: MetricType.AVERAGE,
                sql: 'example',
                table: 'table1',
                name: 'calc2',
            };
            expect(getItemId(additionalMetric)).toEqual('table1_calc2');
        });
    });
});
