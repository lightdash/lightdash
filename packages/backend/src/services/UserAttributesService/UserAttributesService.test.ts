import { ForbiddenError, UserAttribute } from '@lightdash/common';
import { UserAttributesService } from './UserAttributesService';

describe('replaceUserAttributes', () => {
    it('method with no user attribute should return same sqlFilter', async () => {
        expect(
            await UserAttributesService.replaceUserAttributes(
                '${dimension} > 1',
                [],
            ),
        ).toEqual('${dimension} > 1');
        expect(
            await UserAttributesService.replaceUserAttributes(
                '${table.dimension} = 1',
                [],
            ),
        ).toEqual('${table.dimension} = 1');
        expect(
            await UserAttributesService.replaceUserAttributes(
                '${dimension} = ${TABLE}.dimension',
                [],
            ),
        ).toEqual('${dimension} = ${TABLE}.dimension');
    });

    it('method with missing user attribute should throw error', async () => {
        expect(
            UserAttributesService.replaceUserAttributes(
                '${lightdash.attribute.test} > 1',
                [],
            ),
        ).rejects.toThrowError(ForbiddenError);
    });

    it('method should replace sqlFilter with user attribute', async () => {
        const userAttributes: UserAttribute[] = [
            {
                uuid: '',
                name: 'test',
                createdAt: new Date(),
                organizationUuid: '',
                users: [
                    {
                        userUuid: '',
                        email: '',
                        value: '1',
                    },
                ],
            },
        ];
        expect(
            await UserAttributesService.replaceUserAttributes(
                '${lightdash.attribute.test} > 1',
                userAttributes,
            ),
        ).toEqual('1 > 1');
    });

    it('method should replace sqlFilter with multiple user attributes', async () => {
        const userAttributes: UserAttribute[] = [
            {
                uuid: '',
                name: 'test',
                createdAt: new Date(),
                organizationUuid: '',
                users: [
                    {
                        userUuid: '',
                        email: '',
                        value: '1',
                    },
                ],
            },
            {
                uuid: '',
                name: 'another',
                createdAt: new Date(),
                organizationUuid: '',
                users: [
                    {
                        userUuid: '',
                        email: '',
                        value: '2',
                    },
                ],
            },
        ];
        const sqlFilter =
            '${dimension} IS NOT NULL OR (${lightdash.attribute.test} > 1 AND ${lightdash.attribute.another} = 2)';
        const expected = '${dimension} IS NOT NULL OR (1 > 1 AND 2 = 2)';
        expect(
            await UserAttributesService.replaceUserAttributes(
                sqlFilter,
                userAttributes,
            ),
        ).toEqual(expected);
    });

    it('method should replace sqlFilter using short aliases', async () => {
        const userAttributes: UserAttribute[] = [
            {
                uuid: '',
                name: 'test',
                createdAt: new Date(),
                organizationUuid: '',
                users: [
                    {
                        userUuid: '',
                        email: '',
                        value: '1',
                    },
                ],
            },
        ];
        const expected = '1 > 1';
        expect(
            await UserAttributesService.replaceUserAttributes(
                '${ld.attribute.test} > 1',
                userAttributes,
            ),
        ).toEqual(expected);
        expect(
            await UserAttributesService.replaceUserAttributes(
                '${lightdash.attr.test} > 1',
                userAttributes,
            ),
        ).toEqual(expected);
        expect(
            await UserAttributesService.replaceUserAttributes(
                '${ld.attr.test} > 1',
                userAttributes,
            ),
        ).toEqual(expected);
    });
});
