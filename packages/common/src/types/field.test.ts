import { convertFieldRefToFieldId } from './field';

describe('field util functions', () => {
    it('should convert field references to field ids', async () => {
        expect(convertFieldRefToFieldId('table.field')).toEqual('table_field');
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
