import { hasUserAttribute } from './UserAttributeUtils';

describe('hasUserAttribute', () => {
    test('should be false if attribute is not present', () => {
        expect(
            hasUserAttribute(
                [
                    {
                        uuid: '',
                        name: 'test',
                        createdAt: new Date(),
                        organizationUuid: '',
                        default: null,
                        users: [
                            {
                                userUuid: '',
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
                [
                    {
                        uuid: '',
                        name: 'test',
                        createdAt: new Date(),
                        organizationUuid: '',
                        default: null,
                        users: [
                            {
                                userUuid: '',
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

    test('should be false if attribute value does not match even if default is present', () => {
        expect(
            hasUserAttribute(
                [
                    {
                        uuid: '',
                        name: 'test',
                        createdAt: new Date(),
                        organizationUuid: '',
                        default: '2',
                        users: [
                            {
                                userUuid: '',
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
                [
                    {
                        uuid: '',
                        name: 'test',
                        createdAt: new Date(),
                        organizationUuid: '',
                        default: null,
                        users: [
                            {
                                userUuid: '',
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

    test('should be true if user does not have value and default matches', () => {
        expect(
            hasUserAttribute(
                [
                    {
                        uuid: '',
                        name: 'test',
                        createdAt: new Date(),
                        organizationUuid: '',
                        default: '1',
                        users: [],
                    },
                ],
                'test',
                '1',
            ),
        ).toStrictEqual(true);
    });
});
