import { subject } from '@casl/ability';
import {
    ForbiddenError,
    NotFoundError,
    ParameterError,
    SnowflakeAuthenticationType,
    UnexpectedServerError,
    WarehouseTypes,
    type CreateSnowflakeCredentials,
    type DepositSnowflakeCredentials,
    type DepositWarehouseConnectionRequest,
    type SessionUser,
    type WarehouseConnectCode,
    type WarehouseConnectCodeClaimResult,
    type WarehouseConnectInventory,
} from '@lightdash/common';
import { createHash, randomBytes } from 'node:crypto';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { WarehouseConnectCodeModel } from '../../models/WarehouseConnectCodeModel';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { BaseService } from '../BaseService';

const CONNECT_CODE_TTL_MS = 15 * 60 * 1000;

export const hashWarehouseConnectCode = (code: string): string =>
    createHash('sha256').update(code).digest('hex');

const isDurableSnowflakeCredential = (
    credentials: DepositSnowflakeCredentials,
): boolean =>
    credentials.type === WarehouseTypes.SNOWFLAKE &&
    typeof credentials.user === 'string' &&
    Boolean(credentials.user.trim()) &&
    ((credentials.authenticationType ===
        SnowflakeAuthenticationType.PRIVATE_KEY &&
        Boolean(credentials.privateKey?.trim())) ||
        (credentials.authenticationType ===
            SnowflakeAuthenticationType.PASSWORD &&
            Boolean(credentials.password?.trim())));

type WarehouseConnectCodeModelMethods = Pick<
    WarehouseConnectCodeModel,
    'create' | 'consumeForDeposit' | 'findDepositedForClaim'
>;

type EncryptionUtilMethods = Pick<EncryptionUtil, 'encrypt' | 'decrypt'>;

type AnalyticsMethods = Pick<LightdashAnalytics, 'track'>;

type WarehouseConnectServiceArguments = {
    warehouseConnectCodeModel: WarehouseConnectCodeModelMethods;
    encryptionUtil: EncryptionUtilMethods;
    analytics: AnalyticsMethods;
    now?: () => Date;
    generateRandomCode?: () => string;
};

export class WarehouseConnectService extends BaseService {
    private readonly warehouseConnectCodeModel: WarehouseConnectCodeModelMethods;

    private readonly encryptionUtil: EncryptionUtilMethods;

    private readonly analytics: AnalyticsMethods;

    private readonly now: () => Date;

    private readonly generateRandomCode: () => string;

    constructor({
        warehouseConnectCodeModel,
        encryptionUtil,
        analytics,
        now,
        generateRandomCode,
    }: WarehouseConnectServiceArguments) {
        super({ serviceName: 'WarehouseConnectService' });
        this.warehouseConnectCodeModel = warehouseConnectCodeModel;
        this.encryptionUtil = encryptionUtil;
        this.analytics = analytics;
        this.now = now ?? (() => new Date());
        this.generateRandomCode =
            generateRandomCode ?? (() => randomBytes(32).toString('base64url'));
    }

    async mintCode(user: SessionUser): Promise<WarehouseConnectCode> {
        const ability = this.createAuditedAbility(user);
        if (
            user.organizationUuid === undefined ||
            ability.cannot(
                'create',
                subject('Project', {
                    organizationUuid: user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const code = this.generateRandomCode();
        const expiresAt = new Date(this.now().getTime() + CONNECT_CODE_TTL_MS);
        await this.warehouseConnectCodeModel.create({
            codeHash: hashWarehouseConnectCode(code),
            organizationUuid: user.organizationUuid,
            createdByUserUuid: user.userUuid,
            expiresAt,
        });
        this.analytics.track({
            userId: user.userUuid,
            event: 'warehouse_connect_code.created',
            properties: {
                organizationId: user.organizationUuid,
                userId: user.userUuid,
            },
        });
        return { code, expiresAt };
    }

    async deposit({
        code,
        credentials,
        inventory,
    }: DepositWarehouseConnectionRequest): Promise<undefined> {
        if (!isDurableSnowflakeCredential(credentials)) {
            throw new ParameterError(
                'The warehouse connection deposit requires durable Snowflake private-key or password credentials',
            );
        }

        let encryptedCredentials: Buffer;
        try {
            encryptedCredentials = this.encryptionUtil.encrypt(
                JSON.stringify({ credentials, inventory }),
            );
        } catch {
            throw new UnexpectedServerError('Could not save credentials.');
        }

        const connectCode =
            await this.warehouseConnectCodeModel.consumeForDeposit(
                hashWarehouseConnectCode(code),
                encryptedCredentials,
            );
        if (connectCode === null) {
            throw new NotFoundError('Warehouse connect code not found');
        }
        this.analytics.track({
            userId: connectCode.createdByUserUuid,
            event: 'warehouse_connect.deposited',
            properties: {
                organizationId: connectCode.organizationUuid,
                warehouseType: WarehouseTypes.SNOWFLAKE,
                authenticationMethod:
                    credentials.authenticationType ===
                    SnowflakeAuthenticationType.PRIVATE_KEY
                        ? SnowflakeAuthenticationType.PRIVATE_KEY
                        : SnowflakeAuthenticationType.PASSWORD,
            },
        });
        return undefined;
    }

    async claim(
        user: SessionUser,
        code: string,
    ): Promise<WarehouseConnectCodeClaimResult> {
        const codeHash = hashWarehouseConnectCode(code);
        const connectCode =
            await this.warehouseConnectCodeModel.findDepositedForClaim(
                codeHash,
            );
        if (
            connectCode === null ||
            connectCode.createdByUserUuid !== user.userUuid
        ) {
            throw new NotFoundError('Warehouse connect code not found');
        }
        if (
            connectCode.usedAt === null ||
            connectCode.encryptedCredentials === null
        ) {
            return { status: 'pending' };
        }

        try {
            const deposit = JSON.parse(
                this.encryptionUtil.decrypt(connectCode.encryptedCredentials),
            ) as {
                credentials: DepositSnowflakeCredentials;
                inventory: WarehouseConnectInventory | null;
            };
            this.analytics.track({
                userId: connectCode.createdByUserUuid,
                event: 'warehouse_connect.claimed',
                properties: {
                    organizationId: connectCode.organizationUuid,
                },
            });
            return {
                status: 'deposited',
                credentials: deposit.credentials,
                inventory: deposit.inventory ?? null,
            };
        } catch {
            throw new UnexpectedServerError(
                'Could not read deposited credentials.',
            );
        }
    }
}
