import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    MobileSetupCodeError,
    MobileSetupCodeStatus,
    NotFoundError,
    type PossibleAbilities,
} from '@lightdash/common';
import { createHash } from 'crypto';
import { type Knex } from 'knex';
import { fromSession } from '../../auth/account';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type DbMobileSetupCode } from '../../database/entities/mobileSetupCodes';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type MobileSetupCodeModel } from '../../models/MobileSetupCodeModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type UserModel } from '../../models/UserModel';
import { sessionUser } from '../UserService.mock';
import { MobileSetupService } from './MobileSetupService';

vi.mock('crypto', async (importOriginal) => ({
    ...(await importOriginal<typeof import('crypto')>()),
    randomInt: vi.fn(() => 7),
}));

const projectUuid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const codeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const code = 'A'.repeat(32);
const user = {
    ...sessionUser,
    ability: new Ability<PossibleAbilities>([
        { action: 'view', subject: 'Project' },
    ]),
    abilityRules: [{ action: 'view' as const, subject: 'Project' as const }],
};
const account = fromSession(user);
const client = {
    id: 'mobile-client',
    grants: [],
    redirectUris: ['com.lightdash.mobile://oauth/callback'],
    isPublicClient: true,
};

const transaction = { isTransaction: true } as Knex.Transaction;
const token = { accessToken: 'access-token', user, client };
const issueTokens = vi
    .fn<Parameters<MobileSetupService['redeem']>[1]>()
    .mockResolvedValue(token);

const pendingCode = (): DbMobileSetupCode => ({
    mobile_setup_code_uuid: codeId,
    code_hash: createHash('sha256').update(code).digest('hex'),
    user_uuid: user.userUuid,
    organization_uuid: user.organizationUuid!,
    project_uuid: projectUuid,
    created_at: new Date(),
    expires_at: new Date(Date.now() + 300_000),
    redeemed_at: null,
    redeemed_client_id: null,
    redeemed_platform: null,
    revoked_at: null,
    verification_challenge: null,
    verification_client_id: null,
    verification_platform: null,
    verification_code_encrypted: null,
    verification_attempts: 0,
});

const createService = () => {
    const mobileSetupCodeModel = {
        create: vi
            .fn<MobileSetupCodeModel['create']>()
            .mockImplementation(async (input) => ({
                ...pendingCode(),
                ...input,
            })),
        findForUser: vi
            .fn<MobileSetupCodeModel['findForUser']>()
            .mockResolvedValue(pendingCode()),
        findByHash: vi
            .fn<MobileSetupCodeModel['findByHash']>()
            .mockResolvedValue(pendingCode()),
        revoke: vi.fn<MobileSetupCodeModel['revoke']>().mockResolvedValue(),
        beginVerification: vi
            .fn<MobileSetupCodeModel['beginVerification']>()
            .mockImplementation(async (_hash, _user, binding) => ({
                ...pendingCode(),
                ...binding,
            })),
        redeem: vi
            .fn<MobileSetupCodeModel['redeem']>()
            .mockImplementation(
                async (
                    _hash,
                    _clientId,
                    _platform,
                    _userUuid,
                    _verify,
                    callback,
                ) => ({ token: await callback(transaction) }),
            ),
    } as unknown as MobileSetupCodeModel;
    const featureFlagModel = {
        get: vi.fn<FeatureFlagModel['get']>().mockResolvedValue({
            id: FeatureFlags.MobileAppSetup,
            enabled: true,
        }),
    } as unknown as FeatureFlagModel;
    const projectModel = {
        getSummary: vi.fn<ProjectModel['getSummary']>().mockResolvedValue({
            organizationUuid: user.organizationUuid,
        } as Awaited<ReturnType<ProjectModel['getSummary']>>),
    } as unknown as ProjectModel;
    const userModel = {
        findSessionUserAndOrgByUuid: vi
            .fn<UserModel['findSessionUserAndOrgByUuid']>()
            .mockResolvedValue(user),
    } as unknown as UserModel;
    const service = new MobileSetupService({
        mobileSetupCodeModel,
        featureFlagModel,
        projectModel,
        userModel,
        lightdashConfig: {
            ...lightdashConfigMock,
            siteUrl: 'https://instance.example/path/',
            mobileApp: {
                ...lightdashConfigMock.mobileApp,
                setupLinkBaseUrl: 'https://mobile.example/setup',
            },
        },
    });
    return {
        service,
        mobileSetupCodeModel,
        featureFlagModel,
        projectModel,
        userModel,
    };
};

describe('MobileSetupService', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('mints 160-bit base32 codes, stores only the hash and builds the versioned link', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-14T12:00:00Z'));
        const { service, mobileSetupCodeModel } = createService();
        const result = await service.mint(account, projectUuid);
        const second = await service.mint(account, projectUuid);
        expect(result.code).toMatch(/^[A-Z2-7]{32}$/);
        expect(second.code).not.toBe(result.code);
        expect(result.expiresAt).toBe('2026-09-14T12:05:00.000Z');
        expect(result.projectUuid).toBe(projectUuid);
        expect(vi.mocked(mobileSetupCodeModel.create)).toHaveBeenCalledWith({
            code_hash: createHash('sha256').update(result.code).digest('hex'),
            user_uuid: user.userUuid,
            organization_uuid: user.organizationUuid,
            project_uuid: projectUuid,
            expires_at: new Date(result.expiresAt),
        });
        const link = new URL(result.link);
        expect(link.origin).toBe('https://mobile.example');
        expect(link.pathname).toBe('/setup');
        expect(Object.fromEntries(link.searchParams)).toEqual({
            v: '2',
            i: 'https://instance.example',
            c: result.code,
        });
    });

    it('denies minting when the shared feature resolver disables setup', async () => {
        const { service, featureFlagModel, mobileSetupCodeModel } =
            createService();
        vi.mocked(featureFlagModel.get).mockResolvedValue({
            id: FeatureFlags.MobileAppSetup,
            enabled: false,
        });
        await expect(service.mint(account, projectUuid)).rejects.toBeInstanceOf(
            ForbiddenError,
        );
        expect(vi.mocked(mobileSetupCodeModel.create)).not.toHaveBeenCalled();
    });

    it('denies projects outside the active organization', async () => {
        const { service, projectModel, mobileSetupCodeModel } = createService();
        vi.mocked(projectModel.getSummary).mockResolvedValue({
            organizationUuid: 'another-org',
        } as Awaited<ReturnType<ProjectModel['getSummary']>>);
        await expect(service.mint(account, projectUuid)).rejects.toBeInstanceOf(
            ForbiddenError,
        );
        expect(vi.mocked(mobileSetupCodeModel.create)).not.toHaveBeenCalled();
    });

    it('denies projects the caller cannot view', async () => {
        const { service, mobileSetupCodeModel } = createService();
        const denied = fromSession({
            ...user,
            ability: new Ability<PossibleAbilities>([]),
            abilityRules: [],
        });
        await expect(service.mint(denied, projectUuid)).rejects.toBeInstanceOf(
            ForbiddenError,
        );
        expect(vi.mocked(mobileSetupCodeModel.create)).not.toHaveBeenCalled();
    });

    it.each([
        [{}, MobileSetupCodeStatus.PENDING],
        [{ expires_at: new Date(0) }, MobileSetupCodeStatus.EXPIRED],
        [{ revoked_at: new Date(0) }, MobileSetupCodeStatus.REVOKED],
        [
            {
                redeemed_at: new Date(0),
                redeemed_platform: 'ios',
                expires_at: new Date(0),
            },
            MobileSetupCodeStatus.REDEEMED,
        ],
    ])(
        'derives status with stable terminal states',
        async (overrides, status) => {
            const { service, mobileSetupCodeModel } = createService();
            vi.mocked(mobileSetupCodeModel.findForUser).mockResolvedValue({
                ...pendingCode(),
                ...overrides,
            } as DbMobileSetupCode);
            const result = await service.getStatus(account, codeId);
            expect(result.status).toBe(status);
            expect(
                vi.mocked(mobileSetupCodeModel.findForUser),
            ).toHaveBeenCalledWith(codeId, user.userUuid);
            expect(result).not.toHaveProperty('code_hash');
        },
    );

    it('does not expose or revoke a code owned by someone else', async () => {
        const { service, mobileSetupCodeModel } = createService();
        vi.mocked(mobileSetupCodeModel.findForUser).mockResolvedValue(
            undefined,
        );
        await expect(service.getStatus(account, codeId)).rejects.toBeInstanceOf(
            NotFoundError,
        );
        await expect(service.revoke(account, codeId)).rejects.toBeInstanceOf(
            NotFoundError,
        );
        expect(vi.mocked(mobileSetupCodeModel.revoke)).not.toHaveBeenCalled();
    });

    it('revokes an owned code', async () => {
        const { service, mobileSetupCodeModel } = createService();
        await service.revoke(account, codeId);
        expect(vi.mocked(mobileSetupCodeModel.revoke)).toHaveBeenCalledWith(
            codeId,
            user.userUuid,
        );
    });

    it('redeems for the bound user, organization and project', async () => {
        const { service, mobileSetupCodeModel, userModel } = createService();
        await expect(
            service.redeem(
                {
                    code,
                    client,
                    platform: 'ios',
                    codeVerifier: 'a'.repeat(43),
                    verificationCode: '123456',
                },
                issueTokens,
            ),
        ).resolves.toEqual(token);
        expect(issueTokens).toHaveBeenCalledWith(
            { user, projectUuid },
            transaction,
        );
        expect(
            vi.mocked(userModel.findSessionUserAndOrgByUuid),
        ).toHaveBeenCalledWith(user.userUuid, user.organizationUuid);
        expect(vi.mocked(mobileSetupCodeModel.redeem)).toHaveBeenCalledWith(
            pendingCode().code_hash,
            client.id,
            'ios',
            user.userUuid,
            expect.any(Function),
            expect.any(Function),
        );
    });

    it.each([
        [{ expires_at: new Date(0) }, MobileSetupCodeError.EXPIRED],
        [{ redeemed_at: new Date(0) }, MobileSetupCodeError.ALREADY_USED],
        [{ revoked_at: new Date(0) }, MobileSetupCodeError.REVOKED],
    ])('rejects a terminal code', async (overrides, expected) => {
        const { service, mobileSetupCodeModel } = createService();
        vi.mocked(mobileSetupCodeModel.findByHash).mockResolvedValue({
            ...pendingCode(),
            ...overrides,
        });
        await expect(
            service.redeem(
                {
                    code,
                    client,
                    platform: 'ios',
                    codeVerifier: 'a'.repeat(43),
                    verificationCode: '123456',
                },
                issueTokens,
            ),
        ).rejects.toMatchObject({ code: expected });
        expect(vi.mocked(mobileSetupCodeModel.redeem)).not.toHaveBeenCalled();
    });

    it.each([
        { ...client, isPublicClient: false },
        { ...client, redirectUris: ['https://web.example/callback'] },
    ])(
        'rejects a client of the wrong kind before looking up the code',
        async (wrongClient) => {
            const { service, mobileSetupCodeModel } = createService();
            await expect(
                service.redeem(
                    {
                        code,
                        client: wrongClient,
                        platform: 'ios',
                        codeVerifier: 'a'.repeat(43),
                        verificationCode: '123456',
                    },
                    issueTokens,
                ),
            ).rejects.toMatchObject({ code: MobileSetupCodeError.UNKNOWN });
            expect(
                vi.mocked(mobileSetupCodeModel.findByHash),
            ).not.toHaveBeenCalled();
        },
    );

    it('rechecks the rollout flag at exchange time', async () => {
        const { service, mobileSetupCodeModel, featureFlagModel } =
            createService();
        vi.mocked(featureFlagModel.get).mockResolvedValue({
            id: FeatureFlags.MobileAppSetup,
            enabled: false,
        });
        await expect(
            service.redeem(
                {
                    code,
                    client,
                    platform: 'ios',
                    codeVerifier: 'a'.repeat(43),
                    verificationCode: '123456',
                },
                issueTokens,
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(vi.mocked(mobileSetupCodeModel.redeem)).not.toHaveBeenCalled();
    });

    it('rejects a second exchange that loses the atomic claim', async () => {
        const { service, mobileSetupCodeModel } = createService();
        vi.mocked(mobileSetupCodeModel.redeem).mockResolvedValue(undefined);
        vi.mocked(mobileSetupCodeModel.findByHash)
            .mockResolvedValueOnce(pendingCode())
            .mockResolvedValue({ ...pendingCode(), redeemed_at: new Date() });
        await expect(
            service.redeem(
                {
                    code,
                    client,
                    platform: 'android',
                    codeVerifier: 'a'.repeat(43),
                    verificationCode: '123456',
                },
                issueTokens,
            ),
        ).rejects.toMatchObject({ code: MobileSetupCodeError.ALREADY_USED });
    });
    it('begins with encrypted leading-zero digits but never returns them to the phone', async () => {
        const { service, mobileSetupCodeModel } = createService();
        const response = await service.beginChallenge({
            code,
            client,
            platform: 'ios',
            codeChallenge: 'a'.repeat(43),
        });
        expect(Object.keys(response)).toEqual(['expiresAt']);
        const binding = vi.mocked(mobileSetupCodeModel.beginVerification).mock
            .calls[0][2];
        expect(Buffer.isBuffer(binding.verification_code_encrypted)).toBe(true);
        vi.mocked(mobileSetupCodeModel.findForUser).mockResolvedValue({
            ...pendingCode(),
            ...binding,
        });
        expect(await service.getStatus(account, codeId)).toMatchObject({
            status: MobileSetupCodeStatus.AWAITING_VERIFICATION,
            verificationCode: '000007',
        });
    });

    it('checks the feature flag before binding the first phone', async () => {
        const { service, mobileSetupCodeModel, featureFlagModel } =
            createService();
        vi.mocked(featureFlagModel.get).mockResolvedValue({
            id: FeatureFlags.MobileAppSetup,
            enabled: false,
        });
        await expect(
            service.beginChallenge({
                code,
                client,
                platform: 'ios',
                codeChallenge: 'a'.repeat(43),
            }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(mobileSetupCodeModel.beginVerification).not.toHaveBeenCalled();
    });

    it.each(['beginChallenge', 'redeem'] as const)(
        'rechecks account activity at %s',
        async (operation) => {
            const { service, mobileSetupCodeModel, userModel } =
                createService();
            vi.mocked(userModel.findSessionUserAndOrgByUuid).mockResolvedValue({
                ...user,
                isActive: false,
            });
            const action =
                operation === 'beginChallenge'
                    ? service.beginChallenge({
                          code,
                          client,
                          platform: 'ios',
                          codeChallenge: 'a'.repeat(43),
                      })
                    : service.redeem(
                          {
                              code,
                              client,
                              platform: 'ios',
                              codeVerifier: 'a'.repeat(43),
                              verificationCode: '123456',
                          },
                          issueTokens,
                      );
            await expect(action).rejects.toMatchObject({
                code: MobileSetupCodeError.UNKNOWN,
            });
            expect(
                mobileSetupCodeModel.beginVerification,
            ).not.toHaveBeenCalled();
            expect(mobileSetupCodeModel.redeem).not.toHaveBeenCalled();
        },
    );

    it.each(['beginChallenge', 'redeem'] as const)(
        'rechecks project organization at %s',
        async (operation) => {
            const { service, mobileSetupCodeModel, projectModel } =
                createService();
            vi.mocked(projectModel.getSummary).mockResolvedValue({
                organizationUuid: 'another-org',
            } as Awaited<ReturnType<ProjectModel['getSummary']>>);
            const action =
                operation === 'beginChallenge'
                    ? service.beginChallenge({
                          code,
                          client,
                          platform: 'ios',
                          codeChallenge: 'a'.repeat(43),
                      })
                    : service.redeem(
                          {
                              code,
                              client,
                              platform: 'ios',
                              codeVerifier: 'a'.repeat(43),
                              verificationCode: '123456',
                          },
                          issueTokens,
                      );
            await expect(action).rejects.toBeInstanceOf(ForbiddenError);
            expect(
                mobileSetupCodeModel.beginVerification,
            ).not.toHaveBeenCalled();
            expect(mobileSetupCodeModel.redeem).not.toHaveBeenCalled();
        },
    );
});
