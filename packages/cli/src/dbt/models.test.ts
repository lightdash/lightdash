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
});
