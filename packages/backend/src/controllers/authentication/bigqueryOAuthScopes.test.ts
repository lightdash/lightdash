import { FeatureFlags } from '@lightdash/common';
import { type Request } from 'express';
import { type Knex } from 'knex';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type LightdashConfig } from '../../config/parseConfig';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { FeatureFlagService } from '../../services/FeatureFlag/FeatureFlagService';
import {
    getBigqueryOAuthScopes,
    GOOGLE_DRIVE_READONLY_SCOPE,
} from './bigqueryOAuthScopes';

const BIGQUERY_SCOPES = [
    'profile',
    'email',
    'https://www.googleapis.com/auth/bigquery',
];

const user = {
    userUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    organizationUuid: 'org-uuid',
};

const requestWithFlag = (
    get: FeatureFlagService['get'],
    requestUser: Partial<typeof user> | null = user,
) =>
    ({
        user: requestUser ?? undefined,
        services: { getFeatureFlagService: () => ({ get }) },
    }) as unknown as Request;

describe('getBigqueryOAuthScopes', () => {
    it('requests only the BigQuery scope when the flag is off', async () => {
        const get = vi.fn(async () => ({ id: 'flag', enabled: false }));
        await expect(
            getBigqueryOAuthScopes(requestWithFlag(get)),
        ).resolves.toEqual(BIGQUERY_SCOPES);
        expect(get).toHaveBeenCalledWith({
            user,
            featureFlagId: FeatureFlags.BigqueryOAuthDriveAccess,
        });
    });

    it('adds the Drive read scope when the flag is on for the organization', async () => {
        const get = vi.fn(async () => ({ id: 'flag', enabled: true }));
        await expect(
            getBigqueryOAuthScopes(requestWithFlag(get)),
        ).resolves.toEqual([...BIGQUERY_SCOPES, GOOGLE_DRIVE_READONLY_SCOPE]);
    });

    it.each([
        ['no user', null],
        ['no organization', { userUuid: user.userUuid }],
    ])(
        'requests only the BigQuery scope with %s',
        async (_label, requestUser) => {
            const get = vi.fn(async () => ({ id: 'flag', enabled: true }));
            await expect(
                getBigqueryOAuthScopes(requestWithFlag(get, requestUser)),
            ).resolves.toEqual(BIGQUERY_SCOPES);
            expect(get).not.toHaveBeenCalled();
        },
    );

    it.each([
        [new Set<string>([FeatureFlags.BigqueryOAuthDriveAccess]), true],
        [new Set<string>(), false],
    ])(
        'resolves the flag through the standard resolver (env %j)',
        async (enabledFeatureFlags, expectDrive) => {
            const failingDatabase = (() => {
                throw new Error('no feature flag rows');
            }) as unknown as Knex;
            const service = new FeatureFlagService({
                lightdashConfig: lightdashConfigMock,
                featureFlagModel: new FeatureFlagModel({
                    database: failingDatabase,
                    lightdashConfig: {
                        ...lightdashConfigMock,
                        enabledFeatureFlags,
                    } as LightdashConfig,
                }),
            });
            const scopes = await getBigqueryOAuthScopes(
                requestWithFlag(service.get.bind(service)),
            );
            expect(scopes.includes(GOOGLE_DRIVE_READONLY_SCOPE)).toBe(
                expectDrive,
            );
        },
    );
});
