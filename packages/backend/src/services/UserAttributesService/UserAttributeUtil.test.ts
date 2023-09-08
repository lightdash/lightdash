import { hasUserAttribute } from './UserAttributeUtils';

describe('hasUserAttribute', () => {
    test('should be false if attribute is not present', () => {
        expect(
            hasUserAttribute(
                'user-uuid',
                [
                    {
                        uuid: '',
                        name: 'test',
                        createdAt: new Date(),
                        organizationUuid: '',
                        attributeDefault: null,
                        users: [
                            {
                                userUuid: 'user-uuid',
                                email: '',
                                value: '1',
                            },
                        ],
                    },
                ],
                'another',
                '1',
            ),
        ).toStrictEqual(false);
    });
    test('should be false if attribute value does not match', () => {
        expect(
            hasUserAttribute(
                'user-uuid',
                [
                    {
                        uuid: '',
                        name: 'test',
                        createdAt: new Date(),
                        organizationUuid: '',
                        attributeDefault: null,
                        users: [
                            {
                                userUuid: 'user-uuid',
                                email: '',
                                value: '1',
                            },
                        ],
                    },
                ],
                'test',
                '2',
            ),
        ).toStrictEqual(false);
    });

    test('should be false if attribute value does not match even if attributeDefault is present', () => {
        expect(
            hasUserAttribute(
                'user-uuid',

                [
                    {
                        uuid: '',
                        name: 'test',
                        createdAt: new Date(),
                        organizationUuid: '',
                        attributeDefault: '2',
                        users: [
                            {
                                userUuid: 'user-uuid',
                                email: '',
                                value: '1',
                            },
                        ],
                    },
                ],
                'test',
                '2',
            ),
        ).toStrictEqual(false);
    });
    test('should be true if attribute value match user', () => {
        expect(
            hasUserAttribute(
                'user-uuid',

                [
                    {
                        uuid: '',
                        name: 'test',
                        createdAt: new Date(),
                        organizationUuid: '',
                        attributeDefault: null,
                        users: [
                            {
                                userUuid: 'user-uuid',

                                email: '',
                                value: '1',
                            },
                        ],
                    },
                ],
                'test',
                '1',
            ),
        ).toStrictEqual(true);
    });

    test('should be true if user does not have value and attributeDefault matches', () => {
        expect(
            hasUserAttribute(
                'user-uuid',

                [
                    {
                        uuid: '',
                        name: 'test',
                        createdAt: new Date(),
                        organizationUuid: '',
                        attributeDefault: '1',
                        users: [],
                    },
                ],
                'test',
                '1',
            ),
        ).toStrictEqual(true);
    });

    test('should be false if attribute value match a different user', () => {
        expect(
            hasUserAttribute(
                'another-user-uuid',

                [
                    {
                        uuid: '',
                        name: 'test',
                        createdAt: new Date(),
                        organizationUuid: '',
                        attributeDefault: null,
                        users: [
                            {
                                userUuid: 'user-uuid',

                                email: '',
                                value: '1',
                            },
                        ],
                    },
                ],
                'test',
                '1',
            ),
        ).toStrictEqual(false);
    });
});
