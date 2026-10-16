import {
    WarehouseTypes,
    type CreatePostgresCredentials,
    type CreateTrinoCredentials,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { shouldTestExtraCredentials } from './extraConnectionAuthentication';
import { getExtraConnectionRequireUserCredentials } from './extraConnectionUserCredentials';

const original: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'localhost',
    port: 5432,
    dbname: 'database',
    schema: 'public',
    user: 'user',
    password: 'password',
    requireUserCredentials: true,
};
const extra: CreateTrinoCredentials = {
    ...original,
    type: WarehouseTypes.TRINO,
    http_scheme: 'http',
    requireUserCredentials: false,
};

describe('extra connection user credentials', () => {
    it('keeps same-type inheritance', () => {
        expect(
            getExtraConnectionRequireUserCredentials(original, {
                credentials: { ...original, requireUserCredentials: false },
                organizationWarehouseCredentialsUuid: null,
            }),
        ).toBe(true);
    });
    it.each([null, 'organization-credentials-uuid'])(
        'keeps mixed-type credential requirements for source %s',
        (organizationWarehouseCredentialsUuid) => {
            expect(
                getExtraConnectionRequireUserCredentials(original, {
                    credentials: extra,
                    organizationWarehouseCredentialsUuid,
                }),
            ).toBe(false);
            expect(
                getExtraConnectionRequireUserCredentials(
                    { ...original, requireUserCredentials: false },
                    {
                        credentials: { ...extra, requireUserCredentials: true },
                        organizationWarehouseCredentialsUuid,
                    },
                ),
            ).toBe(true);
            expect(
                getExtraConnectionRequireUserCredentials(original, {
                    credentials: {
                        ...extra,
                        requireUserCredentials: undefined,
                    },
                    organizationWarehouseCredentialsUuid,
                }),
            ).toBe(false);
        },
    );
    it('tests Trino shared credentials', () => {
        expect(shouldTestExtraCredentials(extra)).toBe(true);
    });
});
