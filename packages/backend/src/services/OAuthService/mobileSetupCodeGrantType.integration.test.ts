import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    MOBILE_SETUP_CODE_GRANT_TYPE,
    MobileSetupCodeStatus,
    type PossibleAbilities,
} from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { fromSession } from '../../auth/account';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { up } from '../../database/migrations/20260914180000_create_mobile_setup_codes';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { MobileSetupCodeModel } from '../../models/MobileSetupCodeModel';
import { OAuth2Model } from '../../models/OAuth2Model';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type UserModel } from '../../models/UserModel';
import { MobileSetupService } from '../MobileSetupService/MobileSetupService';
import { sessionUser } from '../UserService.mock';
import { createMobileSetupCodeGrantType } from './mobileSetupCodeGrantType';

const user = {
    ...sessionUser,
    userUuid: randomUUID(),
    organizationUuid: randomUUID(),
    ability: new Ability<PossibleAbilities>([
        { action: 'view', subject: 'Project' },
    ]),
    abilityRules: [{ action: 'view' as const, subject: 'Project' as const }],
};
const account = fromSession(user);
const projectUuid = randomUUID();
const client: OAuth2Server.Client = {
    id: 'mobile-client',
    grants: [MOBILE_SETUP_CODE_GRANT_TYPE],
    redirectUris: ['com.lightdash.mobile://oauth/callback'],
    isPublicClient: true,
};
const schema = `mobile_setup_test_${randomUUID().replaceAll('-', '')}`;

const request = (code: string) =>
    new OAuth2Server.Request({
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        query: {},
        body: {
            grant_type: MOBILE_SETUP_CODE_GRANT_TYPE,
            code,
            platform: 'ios',
            scope: 'read write',
        },
    });

describe('mobile setup token exchange (PostgreSQL)', () => {
    let database: Knex;
    let service: MobileSetupService;
    let oauthModel: OAuth2Model;
    let grant: InstanceType<ReturnType<typeof createMobileSetupCodeGrantType>>;

    beforeAll(async () => {
        if (!process.env.PGCONNECTIONURI && !process.env.PGDATABASE)
            throw new Error('Set PG connection variables for PostgreSQL tests');
        database = knex({
            client: 'pg',
            connection: process.env.PGCONNECTIONURI ?? {
                host: process.env.PGHOST,
                port: Number(process.env.PGPORT ?? 5432),
                user: process.env.PGUSER,
                password: process.env.PGPASSWORD,
                database: process.env.PGDATABASE,
            },
            searchPath: [schema, 'public'],
            pool: { min: 0, max: 3 },
        });
        await database.schema.createSchema(schema);
        await Promise.all(
            [
                ['users', 'user_uuid'],
                ['organizations', 'organization_uuid'],
                ['projects', 'project_uuid'],
            ].map(([tableName, column]) =>
                database.schema.createTable(tableName, (table) => {
                    table.uuid(column).primary();
                }),
            ),
        );
        await database.transaction(up);
        await Promise.all(
            [
                ['oauth2_access_tokens', 'access_token'],
                ['oauth2_refresh_tokens', 'refresh_token'],
            ].map(([tableName, column]) =>
                database.schema.createTable(tableName, (table) => {
                    table.string(column).primary();
                    table.timestamp('expires_at').notNullable();
                    table.specificType('scope', 'text[]');
                    table.string('client_id');
                    table.integer('user_id');
                    table.uuid('organization_uuid');
                    table.timestamp('revoked_at');
                }),
            ),
        );
        await database<{ user_uuid: string }>('users').insert({
            user_uuid: user.userUuid,
        });
        await database<{ organization_uuid: string }>('organizations').insert({
            organization_uuid: user.organizationUuid,
        });
        await database<{ project_uuid: string }>('projects').insert({
            project_uuid: projectUuid,
        });
        service = new MobileSetupService({
            mobileSetupCodeModel: new MobileSetupCodeModel(database),
            featureFlagModel: {
                get: vi.fn<FeatureFlagModel['get']>().mockResolvedValue({
                    id: FeatureFlags.MobileAppSetup,
                    enabled: true,
                }),
            } as unknown as FeatureFlagModel,
            projectModel: {
                getSummary: vi
                    .fn<ProjectModel['getSummary']>()
                    .mockResolvedValue({
                        organizationUuid: user.organizationUuid,
                    } as Awaited<ReturnType<ProjectModel['getSummary']>>),
            } as unknown as ProjectModel,
            userModel: {
                findSessionUserAndOrgByUuid: vi
                    .fn<UserModel['findSessionUserAndOrgByUuid']>()
                    .mockResolvedValue(user),
            } as unknown as UserModel,
            lightdashConfig: lightdashConfigMock,
        });
        oauthModel = new OAuth2Model(database, lightdashConfigMock);
        const GrantType = createMobileSetupCodeGrantType(() => service);
        grant = new GrantType({
            model: oauthModel,
            accessTokenLifetime: 3600,
            refreshTokenLifetime: 7200,
        } as OAuth2Server.TokenOptions);
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await database.withSchema(schema).table('mobile_setup_codes').delete();
        await database
            .withSchema(schema)
            .table('oauth2_access_tokens')
            .delete();
        await database
            .withSchema(schema)
            .table('oauth2_refresh_tokens')
            .delete();
    });

    afterAll(async () => {
        if (database) {
            await database.schema.dropSchemaIfExists(schema, true);
            await database.destroy();
        }
    });

    it.each(['access', 'refresh'] as const)(
        'leaves the code pending after a failed %s token write and allows a retry',
        async (kind) => {
            const setup = await service.mint(account, projectUuid);
            const occupied = 'occupied-token';
            const table =
                kind === 'access'
                    ? 'oauth2_access_tokens'
                    : 'oauth2_refresh_tokens';
            const column = kind === 'access' ? 'access_token' : 'refresh_token';
            await database<Record<string, unknown>>(table).insert({
                [column]: occupied,
                expires_at: new Date(Date.now() + 3_600_000),
            });
            const generate = vi.spyOn(
                oauthModel,
                kind === 'access'
                    ? 'generateAccessToken'
                    : 'generateRefreshToken',
            );
            vi.mocked(generate).mockResolvedValueOnce(occupied);
            const save = vi.spyOn(oauthModel, 'saveToken');

            await expect(
                grant.handle(request(setup.code), client),
            ).rejects.toMatchObject({ name: 'invalid_grant' });
            expect(save).toHaveBeenCalledOnce();
            await expect(
                service.getStatus(account, setup.codeId),
            ).resolves.toMatchObject({
                status: MobileSetupCodeStatus.PENDING,
                redeemedAt: null,
                redeemedPlatform: null,
            });
            expect(
                await database('oauth2_access_tokens').select(),
            ).toHaveLength(kind === 'access' ? 1 : 0);
            expect(
                await database('oauth2_refresh_tokens').select(),
            ).toHaveLength(kind === 'refresh' ? 1 : 0);

            const token = await grant.handle(request(setup.code), client);
            expect(token.accessToken).toBeTruthy();
            expect(token.refreshToken).toBeTruthy();
            expect(token.lightdash_project_uuid).toBe(projectUuid);
            await expect(
                service.getStatus(account, setup.codeId),
            ).resolves.toMatchObject({
                status: MobileSetupCodeStatus.REDEEMED,
                redeemedPlatform: 'ios',
            });
            expect(
                await database('oauth2_access_tokens')
                    .where('access_token', token.accessToken)
                    .first(),
            ).toBeDefined();
            expect(
                await database('oauth2_refresh_tokens')
                    .where('refresh_token', token.refreshToken)
                    .first(),
            ).toBeDefined();
        },
    );

    it('commits only one token pair for two racing exchanges', async () => {
        const setup = await service.mint(account, projectUuid);
        const results = await Promise.allSettled([
            grant.handle(request(setup.code), client),
            grant.handle(request(setup.code), client),
        ]);
        expect(
            results.filter((result) => result.status === 'fulfilled'),
        ).toHaveLength(1);
        expect(
            results.filter((result) => result.status === 'rejected'),
        ).toEqual([
            expect.objectContaining({
                reason: expect.objectContaining({
                    name: 'invalid_grant',
                    message: 'already_used',
                }),
            }),
        ]);
        expect(await database('oauth2_access_tokens').select()).toHaveLength(1);
        expect(await database('oauth2_refresh_tokens').select()).toHaveLength(
            1,
        );
    });
});
