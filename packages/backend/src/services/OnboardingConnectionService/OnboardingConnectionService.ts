import { subject } from '@casl/ability';
import {
    AuthorizationError,
    DepositOnboardingConnectionRequest,
    ForbiddenError,
    OnboardingConnectCodeResult,
    OnboardingConnectionDepositResult,
    OnboardingConnectionInventory,
    OnboardingConnectionRequiredValue,
    OnboardingConnectionValidationResult,
    OnboardingConnectionValues,
    OnboardingConnectionValueSources,
    OnboardingStepStatus,
    OnboardingStepType,
    ParameterError,
    RegisteredAccount,
    SnowflakeAuthenticationType,
    WarehouseConnectionError,
    WarehouseTypes,
    type CreateSnowflakeCredentials,
} from '@lightdash/common';
import {
    isSnowflakeOAuthAccessTokenUsable,
    refreshSnowflakeOAuthToken,
    SnowflakeWarehouseClient,
} from '@lightdash/warehouses';
import { createHash, randomBytes } from 'crypto';
import { toSessionUser } from '../../auth/account';
import { OnboardingConnectCodeModel } from '../../models/OnboardingConnectCodeModel';
import { OnboardingProjectStateModel } from '../../models/OnboardingProjectStateModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../BaseService';
import { ProjectService } from '../ProjectService/ProjectService';
import { UserService } from '../UserService';
import {
    SnowflakeConnectionValidationClient,
    WarehouseDiagnosticsService,
} from '../WarehouseDiagnosticsService/WarehouseDiagnosticsService';

const CONNECT_CODE_TTL_MS = 15 * 60 * 1000;
const INVENTORY_LIMIT = 100;

export const hashOnboardingConnectCode = (code: string): string =>
    createHash('sha256').update(code).digest('hex');

const capInventory = (
    inventory: OnboardingConnectionInventory,
): OnboardingConnectionInventory => ({
    databases: inventory.databases.slice(0, INVENTORY_LIMIT),
    warehouses: inventory.warehouses.slice(0, INVENTORY_LIMIT),
    roles: inventory.roles.slice(0, INVENTORY_LIMIT),
});

const getMissingRequiredConnectionValues = (
    values: OnboardingConnectionValues,
): OnboardingConnectionRequiredValue[] =>
    (['database', 'warehouse'] as const).filter((key) => !values[key]);

const expiredCredentialValidationResult =
    (): OnboardingConnectionValidationResult => ({
        diagnostic: {
            status: 'failed',
            checks: [
                {
                    id: 'open_connection',
                    label: 'Open connection',
                    status: 'skipped',
                    durationMs: null,
                    diagnosis: null,
                },
                {
                    id: 'authenticate',
                    label: 'Authenticate',
                    status: 'failed',
                    durationMs: null,
                    diagnosis: {
                        title: 'Your Snowflake connection has expired',
                        detail: 'The stored sign-in can no longer be refreshed. Reconnect by generating a new code and running the CLI command again — your choices here will be kept.',
                        remedySql: null,
                        docsUrl: null,
                    },
                },
                {
                    id: 'use_warehouse',
                    label: 'Use warehouse',
                    status: 'skipped',
                    durationMs: null,
                    diagnosis: null,
                },
                {
                    id: 'use_database',
                    label: 'Use database',
                    status: 'skipped',
                    durationMs: null,
                    diagnosis: null,
                },
                {
                    id: 'list_schemas',
                    label: 'List schemas',
                    status: 'skipped',
                    durationMs: null,
                    diagnosis: null,
                },
            ],
        },
        schemas: null,
        inventory: null,
    });

type OnboardingConnectionServiceArguments = {
    onboardingConnectCodeModel: OnboardingConnectCodeModel;
    onboardingProjectStateModel: OnboardingProjectStateModel;
    projectModel: ProjectModel;
    projectService: ProjectService;
    userService: UserService;
    warehouseDiagnosticsService: WarehouseDiagnosticsService;
    snowflakeClientFactory?: (
        credentials: CreateSnowflakeCredentials,
    ) => SnowflakeConnectionValidationClient &
        Pick<SnowflakeWarehouseClient, 'getSessionDiscovery'>;
    now?: () => Date;
    generateRandomCode?: () => string;
};

export class OnboardingConnectionService extends BaseService {
    private readonly onboardingConnectCodeModel: OnboardingConnectCodeModel;

    private readonly onboardingProjectStateModel: OnboardingProjectStateModel;

    private readonly projectModel: ProjectModel;

    private readonly projectService: ProjectService;

    private readonly userService: UserService;

    private readonly warehouseDiagnosticsService: WarehouseDiagnosticsService;

    private readonly snowflakeClientFactory: NonNullable<
        OnboardingConnectionServiceArguments['snowflakeClientFactory']
    >;

    private readonly now: () => Date;

    private readonly generateRandomCode: () => string;

    constructor(args: OnboardingConnectionServiceArguments) {
        super();
        this.onboardingConnectCodeModel = args.onboardingConnectCodeModel;
        this.onboardingProjectStateModel = args.onboardingProjectStateModel;
        this.projectModel = args.projectModel;
        this.projectService = args.projectService;
        this.userService = args.userService;
        this.warehouseDiagnosticsService = args.warehouseDiagnosticsService;
        this.snowflakeClientFactory =
            args.snowflakeClientFactory ??
            ((credentials) => new SnowflakeWarehouseClient(credentials));
        this.now = args.now ?? (() => new Date());
        this.generateRandomCode =
            args.generateRandomCode ??
            (() => randomBytes(32).toString('base64url'));
    }

    async createConnectCode(
        account: RegisteredAccount,
        projectUuid: string,
    ): Promise<OnboardingConnectCodeResult> {
        const { organizationUuid, type } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('CompileProject', {
                    organizationUuid,
                    projectUuid,
                    type,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const code = `${projectUuid.slice(0, 8)}_${this.generateRandomCode()}`;
        const expiresAt = new Date(this.now().getTime() + CONNECT_CODE_TTL_MS);
        await this.onboardingConnectCodeModel.create({
            codeHash: hashOnboardingConnectCode(code),
            projectUuid,
            createdByUserUuid: account.user.id,
            expiresAt,
        });
        return { code, expiresAt };
    }

    async depositConnection(
        request: DepositOnboardingConnectionRequest,
    ): Promise<OnboardingConnectionDepositResult> {
        const connectCode = await this.onboardingConnectCodeModel.consume(
            hashOnboardingConnectCode(request.code),
        );
        if (connectCode === null) {
            throw new AuthorizationError('Invalid or expired connect code');
        }
        if (request.warehouseConnection.type !== WarehouseTypes.SNOWFLAKE) {
            throw new ParameterError(
                'The onboarding SSO bridge only supports Snowflake credentials',
            );
        }
        if (
            request.warehouseConnection.authenticationType !==
                SnowflakeAuthenticationType.OAUTH ||
            !request.warehouseConnection.refreshToken
        ) {
            throw new ParameterError(
                'The onboarding SSO bridge requires Snowflake OAuth credentials',
            );
        }

        const account = await this.userService.getAccountByUserUuid(
            connectCode.createdByUserUuid,
        );
        const inventory = capInventory(request.inventory);
        const missingConnectionValues = getMissingRequiredConnectionValues(
            request.connectionValues,
        );
        let warehouseConnection: CreateSnowflakeCredentials = {
            ...request.warehouseConnection,
            database: request.connectionValues.database ?? '',
            warehouse: request.connectionValues.warehouse ?? '',
            schema: request.connectionValues.schema ?? '',
            role: request.connectionValues.role ?? undefined,
        };
        if (!isSnowflakeOAuthAccessTokenUsable(warehouseConnection.token)) {
            const refreshed =
                await refreshSnowflakeOAuthToken(warehouseConnection);
            warehouseConnection = {
                ...warehouseConnection,
                token: refreshed.accessToken,
                refreshToken: refreshed.refreshToken,
            };
        }
        await this.projectService.updateWarehouseCredentials(
            connectCode.projectUuid,
            account,
            { warehouseConnection },
        );

        if (missingConnectionValues.length > 0) {
            const result: OnboardingConnectionDepositResult = {
                stepStatus: OnboardingStepStatus.PENDING_CONFIGURATION,
                connectionValues: request.connectionValues,
                connectionValueSources: request.connectionValueSources,
                inventory,
                missingConnectionValues,
                diagnostic: null,
            };
            await this.onboardingProjectStateModel.upsert(
                connectCode.projectUuid,
                OnboardingStepType.CONNECT,
                OnboardingStepStatus.PENDING_CONFIGURATION,
                result,
            );
            return result;
        }

        const diagnostic =
            await this.warehouseDiagnosticsService.diagnoseConnection(
                warehouseConnection,
            );
        const stepStatus =
            diagnostic.status === 'passed'
                ? OnboardingStepStatus.COMPLETED
                : OnboardingStepStatus.ERROR;
        const result: OnboardingConnectionDepositResult = {
            stepStatus,
            connectionValues: request.connectionValues,
            connectionValueSources: request.connectionValueSources,
            inventory,
            missingConnectionValues,
            diagnostic,
        };
        await this.onboardingProjectStateModel.upsert(
            connectCode.projectUuid,
            OnboardingStepType.CONNECT,
            stepStatus,
            result,
        );
        return result;
    }

    async configureConnection(
        account: RegisteredAccount,
        projectUuid: string,
        connectionValues: OnboardingConnectionValues,
    ): Promise<OnboardingConnectionDepositResult> {
        const { organizationUuid, type } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('CompileProject', {
                    organizationUuid,
                    projectUuid,
                    type,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const connectStep = await this.onboardingProjectStateModel.find(
            projectUuid,
            OnboardingStepType.CONNECT,
        );
        if (
            connectStep?.status !==
                OnboardingStepStatus.PENDING_CONFIGURATION ||
            connectStep.result === null
        ) {
            throw new ParameterError(
                'The onboarding connection is not pending configuration',
            );
        }

        const missingConnectionValues =
            getMissingRequiredConnectionValues(connectionValues);
        const { database, warehouse } = connectionValues;
        if (
            missingConnectionValues.length > 0 ||
            database === null ||
            warehouse === null
        ) {
            throw new ParameterError(
                `Missing required connection values: ${missingConnectionValues.join(
                    ', ',
                )}`,
            );
        }

        const pendingResult =
            connectStep.result as OnboardingConnectionDepositResult;
        const project =
            await this.projectModel.getWithSensitiveFields(projectUuid);
        if (project.warehouseConnection?.type !== WarehouseTypes.SNOWFLAKE) {
            throw new ParameterError(
                'The onboarding SSO bridge only supports Snowflake credentials',
            );
        }

        const warehouseConnection: CreateSnowflakeCredentials = {
            ...project.warehouseConnection,
            database,
            warehouse,
            role: connectionValues.role ?? undefined,
            schema: connectionValues.schema ?? '',
        };
        await this.projectService.updateWarehouseCredentials(
            projectUuid,
            account,
            { warehouseConnection },
        );

        const diagnostic =
            await this.warehouseDiagnosticsService.diagnoseConnection(
                warehouseConnection,
            );
        const stepStatus =
            diagnostic.status === 'passed'
                ? OnboardingStepStatus.COMPLETED
                : OnboardingStepStatus.ERROR;
        const connectionValueSources: OnboardingConnectionValueSources = {
            database: 'user',
            warehouse: 'user',
            role: 'user',
            schema: 'user',
        };
        const result: OnboardingConnectionDepositResult = {
            stepStatus,
            connectionValues,
            connectionValueSources,
            inventory: pendingResult.inventory,
            missingConnectionValues,
            diagnostic,
        };
        await this.onboardingProjectStateModel.upsert(
            projectUuid,
            OnboardingStepType.CONNECT,
            stepStatus,
            result,
        );
        return result;
    }

    async validateConnection(
        account: RegisteredAccount,
        projectUuid: string,
        connectionValues: OnboardingConnectionValues,
    ): Promise<OnboardingConnectionValidationResult> {
        const { organizationUuid, type } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('CompileProject', {
                    organizationUuid,
                    projectUuid,
                    type,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const project =
            await this.projectModel.getWithSensitiveFields(projectUuid);
        if (
            project.warehouseConnection?.type !== WarehouseTypes.SNOWFLAKE ||
            project.warehouseConnection.authenticationType !==
                SnowflakeAuthenticationType.OAUTH
        ) {
            throw new ParameterError(
                'The onboarding SSO bridge only supports Snowflake OAuth credentials',
            );
        }
        let resolvedCredentials;
        try {
            resolvedCredentials =
                await this.projectService.getWarehouseCredentialsForUser(
                    toSessionUser(account),
                    projectUuid,
                );
        } catch (error) {
            if (error instanceof WarehouseConnectionError) {
                this.logger.warn(
                    'Onboarding connection validation could not refresh stored credentials',
                    { projectUuid, error: error.message },
                );
                return expiredCredentialValidationResult();
            }
            throw error;
        }
        if (resolvedCredentials.type !== WarehouseTypes.SNOWFLAKE) {
            throw new ParameterError(
                'The onboarding SSO bridge only supports Snowflake OAuth credentials',
            );
        }
        const warehouseConnection: CreateSnowflakeCredentials = {
            ...resolvedCredentials,
            database: connectionValues.database ?? '',
            warehouse: connectionValues.warehouse ?? '',
            role: connectionValues.role ?? undefined,
            schema: connectionValues.schema ?? '',
        };
        const client = this.snowflakeClientFactory(warehouseConnection);
        const { diagnostic, schemas } =
            await this.warehouseDiagnosticsService.validateSnowflakeConnection(
                warehouseConnection,
                client,
            );
        let inventory: OnboardingConnectionInventory | null = null;
        try {
            inventory = capInventory(
                (await client.getSessionDiscovery()).inventory,
            );
        } catch {
            inventory = null;
        }
        return { diagnostic, schemas, inventory };
    }
}
