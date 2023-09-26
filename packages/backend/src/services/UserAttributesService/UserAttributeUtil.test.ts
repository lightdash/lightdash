import { hasUserAttribute } from './UserAttributeUtils';

describe('hasUserAttribute', () => {
    test('should be false if attribute is not present', () => {
        expect(hasUserAttribute({ test: '1' }, 'another', '1')).toStrictEqual(
            false,
        );
    });
    test('should be false if attribute value does not match', () => {
        expect(hasUserAttribute({ test: '1' }, 'test', '2')).toStrictEqual(
            false,
        );
    });
    test('should be true if attribute value match user', () => {
        expect(hasUserAttribute({ test: '1' }, 'test', '1')).toStrictEqual(
            true,
        );
    });

    test('should be false if attribute value match a different user', () => {
        expect(hasUserAttribute({ test: null }, 'test', '1')).toStrictEqual(
            false,
        );
    });
});
