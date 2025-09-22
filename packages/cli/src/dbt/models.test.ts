import { SupportedDbtVersions, DimensionType, DbtSchemaEditor } from '@lightdash/common';
import { isDocBlock } from './models';

describe('Models', () => {
    describe('isDocBlock', () => {
        test('should match all doc block variations', () => {
            expect(isDocBlock("{{doc('user_id')}}")).toBe(true); // single quote
            expect(isDocBlock('{{doc("user_id")}}')).toBe(true); // double quote
            expect(isDocBlock("{{ doc('user_id') }}")).toBe(true); // white spaces
            expect(isDocBlock("{{ doc('user_id')}}")).toBe(true); // inconsistent white space
        });
        test('should return false when value doesnt match doc block', () => {
            expect(isDocBlock()).toBe(false);
            expect(isDocBlock('{{ref("user_id")}}')).toBe(false);
            expect(isDocBlock("doc('user_id')")).toBe(false);
            expect(isDocBlock('my description')).toBe(false);
        });
    });

    describe('DbtSchemaEditor dbt version handling', () => {
        test('should detect dbt v1.10+ correctly', () => {
            const editorV110 = new DbtSchemaEditor('version: 2', '', SupportedDbtVersions.V1_10);
            expect(editorV110.isDbtVersion110OrHigher()).toBe(true);
        });

        test('should detect dbt v1.9 and below correctly', () => {
            const editorV19 = new DbtSchemaEditor('version: 2', '', SupportedDbtVersions.V1_9);
            expect(editorV19.isDbtVersion110OrHigher()).toBe(false);

            const editorV18 = new DbtSchemaEditor('version: 2', '', SupportedDbtVersions.V1_8);
            expect(editorV18.isDbtVersion110OrHigher()).toBe(false);
        });

        test('should handle undefined version (defaults to false)', () => {
            const editorNoVersion = new DbtSchemaEditor('version: 2', '');
            expect(editorNoVersion.isDbtVersion110OrHigher()).toBe(false);
        });
    });
});
