import { convertFieldRefToFieldId, fieldId } from './field';

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
    describe('fieldId', () => {
        it('should return field id', async () => {
            expect(fieldId({ table: 'table', name: 'field' })).toEqual(
                'table_field',
            );
            expect(fieldId({ table: 'table', name: 'field.nested' })).toEqual(
                'table_field__nested',
            );
            expect(fieldId({ table: 'table', name: 'field_test' })).toEqual(
                'table_field_test',
            );
            expect(fieldId({ table: 'table_test', name: 'field' })).toEqual(
                'table_test_field',
            );
            expect(
                fieldId({ table: 'table_test', name: 'field_test' }),
            ).toEqual('table_test_field_test');
            expect(
                fieldId({ table: 'table_test', name: 'field.nested' }),
            ).toEqual('table_test_field__nested');
            expect(
                fieldId({ table: 'table_test', name: 'field_test.nested' }),
            ).toEqual('table_test_field_test__nested');
        });
    });
});
