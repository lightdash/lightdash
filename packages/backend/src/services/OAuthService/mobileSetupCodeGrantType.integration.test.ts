import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    MOBILE_SETUP_CODE_GRANT_TYPE,
    MobileSetupCodeStatus,
    type PossibleAbilities,
} from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import knex, { type Knex } from 'knex';
import { createHash, randomUUID } from 'node:crypto';
import { fromSession } from '../../auth/account';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { up } from '../../database/migrations/20260914180000_create_mobile_setup_codes';
import { up as addVerification } from '../../database/migrations/20260929120000_mobile_setup_verification';
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

const verifier = 'a'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const request = (
    code: string,
    verificationCode?: string,
    codeVerifier: string | undefined = verifier,
) =>
    new OAuth2Server.Request({
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        query: {},
        body: {
            grant_type: MOBILE_SETUP_CODE_GRANT_TYPE,
            code,
            verification_code: verificationCode,
            code_verifier: codeVerifier,
            platform: 'ios',
            scope: 'read write',
        },
    });

describe('mobile setup token exchange (PostgreSQL)', () => {
    let database: Knex;
    let service: MobileSetupService;
    let oauthModel: OAuth2Model;
    let grant: InstanceType<ReturnType<typeof createMobileSetupCodeGrantType>>;

    const verifiedSetup = async () => {
        const setup = await service.mint(account, projectUuid);
        const response = await service.beginChallenge({
            code: setup.code,
            client,
            platform: 'ios',
            codeChallenge: challenge,
        });
        expect(response).toEqual({ expiresAt: setup.expiresAt });
        const status = await service.getStatus(account, setup.codeId);
        expect(status.verificationCode).toMatch(/^[0-9]{6}$/);
        return { ...setup, verificationCode: status.verificationCode! };
    };

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
        await database.raw(
            `CREATE FUNCTION "${schema}".uuid_generate_v4() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()'`,
        );
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
        await database.transaction(addVerification);
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
            const setup = await verifiedSetup();
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
                grant.handle(
                    request(setup.code, setup.verificationCode),
                    client,
                ),
            ).rejects.toMatchObject({ name: 'invalid_grant' });
            expect(save).toHaveBeenCalledOnce();
            await expect(
                service.getStatus(account, setup.codeId),
            ).resolves.toMatchObject({
                status: MobileSetupCodeStatus.AWAITING_VERIFICATION,
                redeemedAt: null,
                redeemedPlatform: null,
            });
            expect(
                await database('oauth2_access_tokens').select(),
            ).toHaveLength(kind === 'access' ? 1 : 0);
            expect(
                await database('oauth2_refresh_tokens').select(),
            ).toHaveLength(kind === 'refresh' ? 1 : 0);

            const token = await grant.handle(
                request(setup.code, setup.verificationCode),
                client,
            );
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
        const setup = await verifiedSetup();
        const results = await Promise.allSettled([
            grant.handle(request(setup.code, setup.verificationCode), client),
            grant.handle(request(setup.code, setup.verificationCode), client),
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
    it('rejects the old code-only exchange without creating tokens', async () => {
        const setup = await service.mint(account, projectUuid);
        await expect(
            grant.handle(request(setup.code), client),
        ).rejects.toMatchObject({ name: 'invalid_grant' });
        expect(await database('oauth2_access_tokens').select()).toHaveLength(0);
        expect(await database('oauth2_refresh_tokens').select()).toHaveLength(
            0,
        );
    });

    it('commits five concurrent wrong guesses and permanently locks the code', async () => {
        const setup = await verifiedSetup();
        const wrong = setup.verificationCode === '000000' ? '000001' : '000000';
        const responses = await Promise.allSettled(
            Array.from({ length: 8 }, () =>
                grant.handle(request(setup.code, wrong), client),
            ),
        );
        expect(
            responses.every((response) => response.status === 'rejected'),
        ).toBe(true);
        const stored = await database('mobile_setup_codes').first();
        expect(stored?.verification_attempts).toBe(5);
        expect(stored?.revoked_at).not.toBeNull();
        await expect(
            grant.handle(request(setup.code, setup.verificationCode), client),
        ).rejects.toMatchObject({ message: 'attempts_exhausted' });
        await expect(
            service.beginChallenge({
                code: setup.code,
                client,
                platform: 'ios',
                codeChallenge: challenge,
            }),
        ).rejects.toMatchObject({ code: 'attempts_exhausted' });
        expect(await database('oauth2_access_tokens').select()).toHaveLength(0);
        expect(await database('oauth2_refresh_tokens').select()).toHaveLength(
            0,
        );
    });

    it('lets the same phone retry without resetting the code, expiry or guesses', async () => {
        const setup = await verifiedSetup();
        const wrong = setup.verificationCode === '000000' ? '000001' : '000000';
        await expect(
            grant.handle(request(setup.code, wrong), client),
        ).rejects.toMatchObject({ message: 'verification_failed' });
        const result = await service.beginChallenge({
            code: setup.code,
            client,
            platform: 'ios',
            codeChallenge: challenge,
        });
        expect(result).toEqual({ expiresAt: setup.expiresAt });
        expect(await service.getStatus(account, setup.codeId)).toMatchObject({
            verificationCode: setup.verificationCode,
        });
        expect(
            (await database('mobile_setup_codes').first())
                ?.verification_attempts,
        ).toBe(1);
        await expect(
            grant.handle(request(setup.code, setup.verificationCode), client),
        ).resolves.toMatchObject({ lightdash_project_uuid: projectUuid });
        expect(
            await service.getStatus(account, setup.codeId),
        ).not.toHaveProperty('verificationCode');
    });

    it('allows exactly one phone to bind during concurrent scans', async () => {
        const setup = await service.mint(account, projectUuid);
        const outcomes = await Promise.allSettled(
            ['a', 'b'].map((value) =>
                service.beginChallenge({
                    code: setup.code,
                    client,
                    platform: 'ios',
                    codeChallenge: value.repeat(43),
                }),
            ),
        );
        expect(
            outcomes.filter((value) => value.status === 'fulfilled'),
        ).toHaveLength(1);
        expect(outcomes.filter((value) => value.status === 'rejected')).toEqual(
            [
                expect.objectContaining({
                    reason: expect.objectContaining({
                        code: 'binding_mismatch',
                    }),
                }),
            ],
        );
    });

    it('rejects copied QR or digits without the bound phone secret without spending its guesses', async () => {
        const setup = await verifiedSetup();
        await expect(
            grant.handle(
                request(setup.code, setup.verificationCode, 'b'.repeat(43)),
                client,
            ),
        ).rejects.toMatchObject({ message: 'binding_mismatch' });
        await expect(
            service.beginChallenge({
                code: setup.code,
                client,
                platform: 'android',
                codeChallenge: challenge,
            }),
        ).rejects.toMatchObject({ code: 'binding_mismatch' });
        await expect(
            grant.handle(request(setup.code, setup.verificationCode), {
                ...client,
                id: 'another-mobile-client',
            }),
        ).rejects.toMatchObject({ message: 'binding_mismatch' });
        expect(
            (await database('mobile_setup_codes').first())
                ?.verification_attempts,
        ).toBe(0);
        expect(await database('oauth2_access_tokens').select()).toHaveLength(0);
    });

    it('never discloses digits to a bearer-authenticated account', async () => {
        const setup = await verifiedSetup();
        const bearerAccount = {
            ...account,
            authentication: { ...account.authentication, type: 'oauth' },
        } as unknown as typeof account;
        await expect(
            service.getStatus(bearerAccount, setup.codeId),
        ).rejects.toThrow('A signed-in session is required');
        expect(
            (
                await database('mobile_setup_codes').first()
            )?.verification_code_encrypted?.toString(),
        ).not.toContain(setup.verificationCode);
    });

    it('keeps the original expiry after a scan and stops exchanges after expiry or cancellation', async () => {
        const setup = await verifiedSetup();
        await database('mobile_setup_codes').update({
            expires_at: new Date(0),
        });
        await expect(
            grant.handle(request(setup.code, setup.verificationCode), client),
        ).rejects.toMatchObject({ message: 'expired' });
        expect(
            await service.getStatus(account, setup.codeId),
        ).not.toHaveProperty('verificationCode');
        await database('mobile_setup_codes').delete();
        const second = await verifiedSetup();
        await service.revoke(account, second.codeId);
        await expect(
            grant.handle(request(second.code, second.verificationCode), client),
        ).rejects.toMatchObject({ message: 'revoked' });
        expect(
            await service.getStatus(account, second.codeId),
        ).not.toHaveProperty('verificationCode');
    });
});
