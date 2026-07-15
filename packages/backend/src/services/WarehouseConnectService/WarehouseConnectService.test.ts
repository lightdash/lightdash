import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    NotFoundError,
    ParameterError,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateSnowflakeCredentials,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { defaultSessionUser } from '../../auth/account/account.mock';
import {
    WarehouseConnectCodeModel,
    type WarehouseConnectCodeRecord,
} from '../../models/WarehouseConnectCodeModel';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import {
    hashWarehouseConnectCode,
    WarehouseConnectService,
} from './WarehouseConnectService';

const code = 'raw-connect-code';
const now = new Date('2026-07-15T12:00:00.000Z');
const expiresAt = new Date('2026-07-15T12:15:00.000Z');
const encryptedCredentials = Buffer.from('encrypted-credentials');

const credentials: CreateSnowflakeCredentials = {
    type: WarehouseTypes.SNOWFLAKE,
    account: 'account',
    user: 'user',
    authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
    privateKey: 'private-key',
    role: 'role',
    database: 'database',
    warehouse: 'warehouse',
    schema: 'schema',
};

const depositedRecord: WarehouseConnectCodeRecord = {
    organizationUuid: defaultSessionUser.organizationUuid!,
    createdByUserUuid: defaultSessionUser.userUuid,
    expiresAt,
    usedAt: new Date('2026-07-15T12:01:00.000Z'),
    encryptedCredentials,
};

const pendingRecord: WarehouseConnectCodeRecord = {
    ...depositedRecord,
    usedAt: null,
    encryptedCredentials: null,
};

const createModelMock = () => ({
    create: vi.fn<WarehouseConnectCodeModel['create']>(),
    consumeForDeposit: vi.fn<WarehouseConnectCodeModel['consumeForDeposit']>(),
    findDepositedForClaim:
        vi.fn<WarehouseConnectCodeModel['findDepositedForClaim']>(),
    deleteDepositedForClaim:
        vi.fn<WarehouseConnectCodeModel['deleteDepositedForClaim']>(),
});

const createEncryptionUtilMock = () => ({
    encrypt: vi.fn<EncryptionUtil['encrypt']>(() => encryptedCredentials),
    decrypt: vi.fn<EncryptionUtil['decrypt']>(() =>
        JSON.stringify(credentials),
    ),
});

const createAnalyticsMock = () => ({
    track: vi.fn<LightdashAnalytics['track']>(),
});

const createUser = (canCreateProject = true): SessionUser => ({
    ...defaultSessionUser,
    ability: new Ability<PossibleAbilities>(
        canCreateProject ? [{ subject: 'Project', action: 'create' }] : [],
    ),
});

describe('WarehouseConnectService', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('mints a 15-minute code after checking project creation permission', async () => {
        const model = createModelMock();
        const encryptionUtil = createEncryptionUtilMock();
        const analytics = createAnalyticsMock();
        const service = new WarehouseConnectService({
            warehouseConnectCodeModel: model,
            encryptionUtil,
            analytics,
            now: () => now,
            generateRandomCode: () => code,
        });

        await expect(service.mintCode(createUser())).resolves.toEqual({
            code,
            expiresAt,
        });
        expect(vi.mocked(analytics.track)).toHaveBeenCalledWith({
            userId: defaultSessionUser.userUuid,
            event: 'warehouse_connect_code.created',
            properties: {
                organizationId: defaultSessionUser.organizationUuid,
                userId: defaultSessionUser.userUuid,
            },
        });
        expect(model.create).toHaveBeenCalledWith({
            codeHash: hashWarehouseConnectCode(code),
            organizationUuid: defaultSessionUser.organizationUuid,
            createdByUserUuid: defaultSessionUser.userUuid,
            expiresAt,
        });
    });

    it('rejects minting without project creation permission', async () => {
        const model = createModelMock();
        const service = new WarehouseConnectService({
            warehouseConnectCodeModel: model,
            encryptionUtil: createEncryptionUtilMock(),
            analytics: createAnalyticsMock(),
        });

        await expect(service.mintCode(createUser(false))).rejects.toThrow(
            ForbiddenError,
        );
        expect(model.create).not.toHaveBeenCalled();
    });

    it.each([
        {
            name: 'SSO credentials',
            value: {
                ...credentials,
                authenticationType: SnowflakeAuthenticationType.SSO,
                privateKey: undefined,
                token: 'short-lived-token',
            },
        },
        {
            name: 'OAuth authorization code credentials',
            value: {
                ...credentials,
                authenticationType:
                    SnowflakeAuthenticationType.OAUTH_AUTHORIZATION_CODE,
                privateKey: undefined,
                token: 'short-lived-token',
            },
        },
        {
            name: 'private-key credentials without a private key',
            value: {
                ...credentials,
                privateKey: ' ',
            },
        },
        {
            name: 'password credentials without a password',
            value: {
                ...credentials,
                authenticationType: SnowflakeAuthenticationType.PASSWORD,
                privateKey: undefined,
                password: ' ',
            },
        },
        {
            name: 'credentials without a user',
            value: {
                ...credentials,
                user: ' ',
            },
        },
    ] satisfies { name: string; value: CreateSnowflakeCredentials }[])(
        'rejects $name without consuming the code',
        async ({ value }) => {
            const model = createModelMock();
            const encryptionUtil = createEncryptionUtilMock();
            const service = new WarehouseConnectService({
                warehouseConnectCodeModel: model,
                encryptionUtil,
                analytics: createAnalyticsMock(),
            });

            await expect(
                service.deposit({ code, credentials: value }),
            ).rejects.toThrow(ParameterError);
            expect(encryptionUtil.encrypt).not.toHaveBeenCalled();
            expect(model.consumeForDeposit).not.toHaveBeenCalled();
        },
    );

    it('allows a code to be consumed only once', async () => {
        const model = createModelMock();
        model.consumeForDeposit
            .mockResolvedValueOnce(depositedRecord)
            .mockResolvedValueOnce(null);
        const analytics = createAnalyticsMock();
        const service = new WarehouseConnectService({
            warehouseConnectCodeModel: model,
            encryptionUtil: createEncryptionUtilMock(),
            analytics,
        });

        await expect(service.deposit({ code, credentials })).resolves.toBe(
            undefined,
        );
        await expect(service.deposit({ code, credentials })).rejects.toThrow(
            NotFoundError,
        );
        expect(model.consumeForDeposit).toHaveBeenCalledWith(
            hashWarehouseConnectCode(code),
            encryptedCredentials,
        );
        expect(vi.mocked(analytics.track)).toHaveBeenCalledWith({
            userId: depositedRecord.createdByUserUuid,
            event: 'warehouse_connect.deposited',
            properties: {
                organizationId: depositedRecord.organizationUuid,
                warehouseType: WarehouseTypes.SNOWFLAKE,
                authenticationMethod: SnowflakeAuthenticationType.PRIVATE_KEY,
            },
        });
    });

    it('returns NotFound for an expired code', async () => {
        const model = createModelMock();
        model.consumeForDeposit.mockResolvedValue(null);
        const service = new WarehouseConnectService({
            warehouseConnectCodeModel: model,
            encryptionUtil: createEncryptionUtilMock(),
            analytics: createAnalyticsMock(),
        });

        await expect(service.deposit({ code, credentials })).rejects.toThrow(
            NotFoundError,
        );
    });

    it('returns NotFound when a non-creator tries to claim', async () => {
        const model = createModelMock();
        model.findDepositedForClaim.mockResolvedValue(depositedRecord);
        const service = new WarehouseConnectService({
            warehouseConnectCodeModel: model,
            encryptionUtil: createEncryptionUtilMock(),
            analytics: createAnalyticsMock(),
        });
        const otherUser = {
            ...createUser(),
            userUuid: 'other-user-uuid',
        };

        await expect(service.claim(otherUser, code)).rejects.toThrow(
            NotFoundError,
        );
        expect(model.deleteDepositedForClaim).not.toHaveBeenCalled();
    });

    it('returns pending before credentials are deposited', async () => {
        const model = createModelMock();
        model.findDepositedForClaim.mockResolvedValue(pendingRecord);
        const service = new WarehouseConnectService({
            warehouseConnectCodeModel: model,
            encryptionUtil: createEncryptionUtilMock(),
            analytics: createAnalyticsMock(),
        });

        await expect(service.claim(createUser(), code)).resolves.toEqual({
            status: 'pending',
        });
        expect(model.deleteDepositedForClaim).not.toHaveBeenCalled();
    });

    it('returns deposited credentials once and then returns NotFound', async () => {
        const model = createModelMock();
        model.findDepositedForClaim
            .mockResolvedValueOnce(depositedRecord)
            .mockResolvedValueOnce(null);
        model.deleteDepositedForClaim.mockResolvedValue(depositedRecord);
        const encryptionUtil = createEncryptionUtilMock();
        const analytics = createAnalyticsMock();
        const service = new WarehouseConnectService({
            warehouseConnectCodeModel: model,
            encryptionUtil,
            analytics,
        });
        const user = createUser();

        await expect(service.claim(user, code)).resolves.toEqual({
            status: 'deposited',
            credentials,
        });
        await expect(service.claim(user, code)).rejects.toThrow(NotFoundError);
        expect(model.deleteDepositedForClaim).toHaveBeenCalledWith(
            hashWarehouseConnectCode(code),
            user.userUuid,
        );
        expect(encryptionUtil.decrypt).toHaveBeenCalledWith(
            encryptedCredentials,
        );
        expect(vi.mocked(analytics.track)).toHaveBeenCalledWith({
            userId: user.userUuid,
            event: 'warehouse_connect.claimed',
            properties: {
                organizationId: depositedRecord.organizationUuid,
            },
        });
    });
});
