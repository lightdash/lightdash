import { hasUserAttribute, hasUserAttributes } from './UserAttributeUtils';

describe('hasUserAttribute', () => {
    test('should be false if attribute is not present', () => {
        expect(hasUserAttribute({ test: ['1'] }, 'another', '1')).toStrictEqual(
            false,
        );
    });
    test('should be false if attribute value does not match', () => {
        expect(hasUserAttribute({ test: ['1'] }, 'test', '2')).toStrictEqual(
            false,
        );
    });
    test('should be true if attribute value match user', () => {
        expect(hasUserAttribute({ test: ['1'] }, 'test', '1')).toStrictEqual(
            true,
        );
    });

    test('should be false if attribute value match a different user', () => {
        expect(hasUserAttribute({ test: [] }, 'test', '1')).toStrictEqual(
            false,
        );
    });
});
describe('hasUserAttributes', () => {
    test('should be true if there are no required attributes', () => {
        expect(hasUserAttributes(undefined, { test: ['1'] })).toStrictEqual(
            true,
        );
        expect(hasUserAttributes({}, { test: ['1'] })).toStrictEqual(true);
    });
    test('should be false if required attributes are not present', () => {
        expect(
            hasUserAttributes({ another: '1' }, { test: ['1'] }),
        ).toStrictEqual(false);
    });
    test('should be false if required attribute values does not match', () => {
        expect(hasUserAttributes({ test: '2' }, { test: ['1'] })).toStrictEqual(
            false,
        );
        expect(hasUserAttributes({ test: '1' }, { test: [] })).toStrictEqual(
            false,
        );
        expect(
            hasUserAttributes(
                { test: '2', another: '1' },
                { test: ['1'], another: ['1'] },
            ),
        ).toStrictEqual(false);
    });
    test('should be true if required attribute value match', () => {
        expect(hasUserAttributes({ test: '1' }, { test: ['1'] })).toStrictEqual(
            true,
        );
    });
});
