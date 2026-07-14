import { subject } from '@casl/ability';
import {
    AuthorizationError,
    DepositOnboardingConnectionRequest,
    ForbiddenError,
    OnboardingConnectCodeResult,
    OnboardingConnectionDepositResult,
    OnboardingConnectionInventory,
    OnboardingConnectionRequiredValue,
    OnboardingConnectionValues,
    OnboardingStepStatus,
    OnboardingStepType,
    ParameterError,
    RegisteredAccount,
    WarehouseTypes,
    type CreateSnowflakeCredentials,
} from '@lightdash/common';
import { createHash, randomBytes } from 'crypto';
import { OnboardingConnectCodeModel } from '../../models/OnboardingConnectCodeModel';
import { OnboardingProjectStateModel } from '../../models/OnboardingProjectStateModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../BaseService';
import { ProjectService } from '../ProjectService/ProjectService';
import { UserService } from '../UserService';
import { WarehouseDiagnosticsService } from '../WarehouseDiagnosticsService/WarehouseDiagnosticsService';

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

type OnboardingConnectionServiceArguments = {
    onboardingConnectCodeModel: OnboardingConnectCodeModel;
    onboardingProjectStateModel: OnboardingProjectStateModel;
    projectModel: ProjectModel;
    projectService: ProjectService;
    userService: UserService;
    warehouseDiagnosticsService: WarehouseDiagnosticsService;
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

        const account = await this.userService.getAccountByUserUuid(
            connectCode.createdByUserUuid,
        );
        const inventory = capInventory(request.inventory);
        const missingConnectionValues = getMissingRequiredConnectionValues(
            request.connectionValues,
        );
        const warehouseConnection: CreateSnowflakeCredentials = {
            ...request.warehouseConnection,
            database: request.connectionValues.database ?? '',
            warehouse: request.connectionValues.warehouse ?? '',
            schema: request.connectionValues.schema ?? '',
            role: request.connectionValues.role ?? undefined,
        };
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
}
