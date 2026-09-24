import { subject } from '@casl/ability';
import {
    assertRegisteredAccount,
    ConflictError,
    ForbiddenError,
    ParameterError,
    ProjectType,
    sensitiveCredentialsFieldNames,
    validateWarehouseConnectionName,
    WAREHOUSE_CONNECTION_ALREADY_MULTI_MESSAGE,
    WAREHOUSE_CONNECTION_NAME_CONFLICT_MESSAGE,
    WAREHOUSE_CONNECTION_SWITCH_PLAN_CHANGED_MESSAGE,
    type Account,
    type ApiCreateWarehouseConnectionRequest,
    type ApiExecuteWarehouseConnectionSwitchRequest,
    type ApiWarehouseConnectionSwitchRequest,
    type CreateWarehouseCredentials,
    type ProjectSummary,
    type RegisteredAccount,
    type WarehouseConnectionSwitchAvailability,
    type WarehouseConnectionSwitchPlan,
    type WarehouseConnectionSwitchResult,
} from '@lightdash/common';
import { createHash } from 'node:crypto';
import { DatabaseError } from 'pg';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { createAuditLogEvent } from '../../logging/auditLog';
import { createActorFromAccount } from '../../logging/caslAuditWrapper';
import { logAuditEvent } from '../../logging/winston';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import {
    type WarehouseConnectionCredentialSource,
    type WarehouseConnectionModel,
} from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import {
    type WarehouseConnectionSwitchModel,
    type WarehouseConnectionSwitchProject,
} from '../../models/WarehouseConnectionSwitchModel/WarehouseConnectionSwitchModel';
import { BaseService } from '../BaseService';
import { type FeatureFlagService } from '../FeatureFlag/FeatureFlagService';
import { type LicenseService } from '../LicenseService/LicenseService';
import { getMultipleConnectionsBlockReason } from '../WarehouseConnectionService/multipleConnectionsGate';
import { type WarehouseCredentialPolicy } from '../WarehouseConnectionService/WarehouseConnectionService';

export const DEFAULT_PROJECT_ONLY_REASON =
    'Only a default project can have multiple connections.';
export const ORIGINAL_ORGANIZATION_CREDENTIALS_REASON =
    'A project whose warehouse uses organisation credentials cannot have multiple connections yet.';
const IDEMPOTENCY_KEY_USED_MESSAGE =
    'This switch request was already used for another project.';
const IDEMPOTENCY_KEY_CONSTRAINT =
    'project_connection_mode_events_idempotency_key_unique';

type WarehouseConnectionSwitchServiceArguments = {
    warehouseConnectionSwitchModel: WarehouseConnectionSwitchModel;
    warehouseConnectionModel: WarehouseConnectionModel;
    projectModel: Pick<
        ProjectModel,
        'getSummary' | 'getWarehouseCredentialsForProject'
    >;
    featureFlagService: Pick<FeatureFlagService, 'get'>;
    licenseService: Pick<LicenseService, 'canHoldMultipleConnections'>;
    credentialPolicy: WarehouseCredentialPolicy;
    analytics: Pick<LightdashAnalytics, 'track'>;
};

type SwitchEventPlan = WarehouseConnectionSwitchPlan & {
    switched: Omit<WarehouseConnectionSwitchResult, 'eventUuid'>;
};

type PreparedSwitch = {
    organizationUuid: string;
    plan: WarehouseConnectionSwitchPlan;
    originalName: string;
    connectionName: string;
    source: WarehouseConnectionCredentialSource;
    credentials: CreateWarehouseCredentials;
};

const sortedJson = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortedJson);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, entry]) => [key, sortedJson(entry)]),
        );
    }
    return value;
};

const withoutSecrets = (credentials: CreateWarehouseCredentials) =>
    Object.fromEntries(
        Object.entries(credentials).filter(
            ([key]) =>
                !(sensitiveCredentialsFieldNames as readonly string[]).includes(
                    key,
                ),
        ),
    );

const databaseOf = (credentials: CreateWarehouseCredentials): string | null => {
    if ('dbname' in credentials && typeof credentials.dbname === 'string') {
        return credentials.dbname;
    }
    if ('database' in credentials && typeof credentials.database === 'string') {
        return credentials.database;
    }
    return null;
};

const isIdempotencyKeyConflict = (error: unknown): boolean =>
    error instanceof DatabaseError &&
    error.code === '23505' &&
    error.constraint === IDEMPOTENCY_KEY_CONSTRAINT;

export class WarehouseConnectionSwitchService extends BaseService {
    private readonly switchModel: WarehouseConnectionSwitchModel;

    private readonly connectionModel: WarehouseConnectionModel;

    private readonly projectModel: WarehouseConnectionSwitchServiceArguments['projectModel'];

    private readonly featureFlagService: Pick<FeatureFlagService, 'get'>;

    private readonly licenseService: Pick<
        LicenseService,
        'canHoldMultipleConnections'
    >;

    private readonly credentialPolicy: WarehouseCredentialPolicy;

    private readonly analytics: Pick<LightdashAnalytics, 'track'>;

    constructor(args: WarehouseConnectionSwitchServiceArguments) {
        super({ serviceName: 'WarehouseConnectionSwitchService' });
        this.switchModel = args.warehouseConnectionSwitchModel;
        this.connectionModel = args.warehouseConnectionModel;
        this.projectModel = args.projectModel;
        this.featureFlagService = args.featureFlagService;
        this.licenseService = args.licenseService;
        this.credentialPolicy = args.credentialPolicy;
        this.analytics = args.analytics;
    }

    private async assertCanManageProject(
        account: Account,
        projectUuid: string,
    ): Promise<ProjectSummary> {
        const summary = await this.projectModel.getSummary(projectUuid);
        if (
            this.createAuditedAbility(account).cannot(
                'manage',
                subject('Project', {
                    organizationUuid: summary.organizationUuid,
                    projectUuid,
                    metadata: { projectUuid, projectName: summary.name },
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage this project',
            );
        }
        return summary;
    }

    private async getBlockReason(
        account: RegisteredAccount,
        project: WarehouseConnectionSwitchProject,
    ): Promise<string | null> {
        if (project.connectionMode === 'multi') {
            return WAREHOUSE_CONNECTION_ALREADY_MULTI_MESSAGE;
        }
        if (
            project.type !== ProjectType.DEFAULT ||
            project.provisioningSource !== null
        ) {
            return DEFAULT_PROJECT_ONLY_REASON;
        }
        const gateReason = await getMultipleConnectionsBlockReason(
            {
                licenseService: this.licenseService,
                featureFlagService: this.featureFlagService,
            },
            account,
            project,
        );
        if (gateReason !== null) return gateReason;
        return project.originalOrganizationWarehouseCredentialsUuid === null
            ? null
            : ORIGINAL_ORGANIZATION_CREDENTIALS_REASON;
    }

    private async assertCanSwitch(
        account: RegisteredAccount,
        project: WarehouseConnectionSwitchProject,
    ): Promise<void> {
        const reason = await this.getBlockReason(account, project);
        if (reason === WAREHOUSE_CONNECTION_ALREADY_MULTI_MESSAGE) {
            throw new ConflictError(reason);
        }
        if (reason !== null) {
            throw new ForbiddenError(reason);
        }
    }

    private static parseName(name: string): string {
        const error = validateWarehouseConnectionName(name);
        if (error) {
            throw new ParameterError(error);
        }
        return name.trim();
    }

    private static toSource(
        request: ApiCreateWarehouseConnectionRequest,
    ): WarehouseConnectionCredentialSource {
        if (
            (request.warehouseConnection === undefined) ===
            (request.organizationWarehouseCredentialsUuid === undefined)
        ) {
            throw new ParameterError(
                'Provide either warehouse credentials or an organization warehouse credential.',
            );
        }
        return request.organizationWarehouseCredentialsUuid !== undefined
            ? {
                  kind: 'organization',
                  organizationWarehouseCredentialsUuid:
                      request.organizationWarehouseCredentialsUuid,
              }
            : { kind: 'project', credentials: request.warehouseConnection! };
    }

    private assertCanWrite(
        account: Account,
        summary: ProjectSummary,
        source: WarehouseConnectionCredentialSource,
        credentials: CreateWarehouseCredentials | null,
    ): void {
        this.credentialPolicy.assertCanWriteWarehouseConnection(
            account,
            summary,
            {
                warehouseConnection: credentials ?? undefined,
                organizationWarehouseCredentialsUuid:
                    source.kind === 'organization'
                        ? source.organizationWarehouseCredentialsUuid
                        : undefined,
            },
        );
    }

    private async assertConnectionWorks(
        account: RegisteredAccount,
        organizationUuid: string,
        credentials: CreateWarehouseCredentials,
    ): Promise<void> {
        const result =
            await this.credentialPolicy.testWarehouseConnectionCredentials(
                account,
                organizationUuid,
                credentials,
            );
        if (!result.ok) {
            const reason = result.hops.find(
                (hop) => hop.status === 'failed',
            )?.message;
            throw new ParameterError(
                reason
                    ? `Warehouse connection test failed: ${reason}`
                    : 'Warehouse connection test failed.',
            );
        }
    }

    private static planHash({
        account,
        project,
        request,
        originalName,
        connectionName,
        source,
        credentials,
    }: {
        account: RegisteredAccount;
        project: WarehouseConnectionSwitchProject;
        request: ApiWarehouseConnectionSwitchRequest;
        originalName: string;
        connectionName: string;
        source: WarehouseConnectionCredentialSource;
        credentials: CreateWarehouseCredentials;
    }): string {
        const identity = {
            projectUuid: project.projectUuid,
            original: {
                warehouseType: project.originalWarehouseType,
                credentialsFingerprint: project.originalCredentialsFingerprint,
                organizationWarehouseCredentialsUuid:
                    project.originalOrganizationWarehouseCredentialsUuid,
                name: originalName,
                listAllDatabases: request.original.listAllDatabases,
                additionalDatabases: request.original.additionalDatabases,
            },
            connection: {
                name: connectionName,
                warehouseType: credentials.type,
                source:
                    source.kind === 'organization'
                        ? {
                              organizationWarehouseCredentialsUuid:
                                  source.organizationWarehouseCredentialsUuid,
                          }
                        : { credentials: withoutSecrets(source.credentials) },
                database: databaseOf(credentials),
                listAllDatabases: request.connection.listAllDatabases ?? false,
                additionalDatabases:
                    request.connection.additionalDatabases ?? [],
            },
            connectionTest: 'ok',
            actorUserUuid: account.user.userUuid,
        };
        return createHash('sha256')
            .update(JSON.stringify(sortedJson(identity)))
            .digest('hex');
    }

    private async prepare(
        account: RegisteredAccount,
        projectUuid: string,
        request: ApiWarehouseConnectionSwitchRequest,
    ): Promise<PreparedSwitch> {
        const summary = await this.assertCanManageProject(account, projectUuid);
        const source = WarehouseConnectionSwitchService.toSource(
            request.connection,
        );
        this.assertCanWrite(
            account,
            summary,
            source,
            source.kind === 'project' ? source.credentials : null,
        );
        const originalName = WarehouseConnectionSwitchService.parseName(
            request.original.name,
        );
        const connectionName = WarehouseConnectionSwitchService.parseName(
            request.connection.name,
        );
        if (originalName === connectionName) {
            throw new ConflictError(WAREHOUSE_CONNECTION_NAME_CONFLICT_MESSAGE);
        }
        const project = await this.switchModel.getProject(projectUuid);
        await this.assertCanSwitch(account, project);
        const credentials =
            source.kind === 'project'
                ? source.credentials
                : await this.connectionModel.loadOrganizationCredentials(
                      project.organizationUuid,
                      source.organizationWarehouseCredentialsUuid,
                  );
        this.assertCanWrite(account, summary, source, credentials);
        if (credentials.type !== project.originalWarehouseType) {
            throw new ParameterError(
                'An extra connection must use the same warehouse type as the original connection.',
            );
        }
        await this.assertConnectionWorks(
            account,
            project.organizationUuid,
            credentials,
        );
        const [staysOnOriginal, usersWithPersonalCredentials, original] =
            await Promise.all([
                this.switchModel.getContentCounts(project),
                this.switchModel.countUsersWithPersonalCredentials(projectUuid),
                this.projectModel.getWarehouseCredentialsForProject(
                    projectUuid,
                ),
            ]);
        return {
            organizationUuid: project.organizationUuid,
            originalName,
            connectionName,
            source,
            credentials,
            plan: {
                planHash: WarehouseConnectionSwitchService.planHash({
                    account,
                    project,
                    request,
                    originalName,
                    connectionName,
                    source,
                    credentials,
                }),
                original: {
                    name: originalName,
                    warehouseType: credentials.type,
                    listAllDatabases: request.original.listAllDatabases,
                    additionalDatabases: request.original.additionalDatabases,
                },
                connection: {
                    name: connectionName,
                    warehouseType: credentials.type,
                    database: databaseOf(credentials),
                    usesOrganizationCredentials: source.kind === 'organization',
                },
                staysOnOriginal,
                personalCredentials: {
                    usersWithPersonalCredentials,
                    requireUserCredentials:
                        original.requireUserCredentials === true,
                },
            },
        };
    }

    async getAvailability(
        account: Account,
        projectUuid: string,
    ): Promise<WarehouseConnectionSwitchAvailability> {
        assertRegisteredAccount(account);
        await this.assertCanManageProject(account, projectUuid);
        const project = await this.switchModel.getProject(projectUuid);
        const reason = await this.getBlockReason(account, project);
        return {
            canSwitch: reason === null,
            reason,
            originalWarehouseType: project.originalWarehouseType,
        };
    }

    async preview(
        account: Account,
        projectUuid: string,
        request: ApiWarehouseConnectionSwitchRequest,
    ): Promise<WarehouseConnectionSwitchPlan> {
        assertRegisteredAccount(account);
        return (await this.prepare(account, projectUuid, request)).plan;
    }

    private async findRepeatedSwitch(
        projectUuid: string,
        idempotencyKey: string,
    ): Promise<WarehouseConnectionSwitchResult | null> {
        return this.findRepeatedSwitchWith(
            this.switchModel,
            projectUuid,
            idempotencyKey,
        );
    }

    async execute(
        account: Account,
        projectUuid: string,
        request: ApiExecuteWarehouseConnectionSwitchRequest,
    ): Promise<WarehouseConnectionSwitchResult> {
        assertRegisteredAccount(account);
        await this.assertCanManageProject(account, projectUuid);
        const repeated = await this.findRepeatedSwitch(
            projectUuid,
            request.idempotencyKey,
        );
        if (repeated) return repeated;
        const prepared = await this.prepare(account, projectUuid, request);
        if (prepared.plan.planHash !== request.planHash) {
            throw new ConflictError(
                WAREHOUSE_CONNECTION_SWITCH_PLAN_CHANGED_MESSAGE,
            );
        }

        let result: WarehouseConnectionSwitchResult;
        try {
            result = await this.switchModel.transaction(
                async ({ switchModel, connectionModel }) => {
                    await connectionModel.lockProject(projectUuid);
                    const repeatedInside = await this.findRepeatedSwitchWith(
                        switchModel,
                        projectUuid,
                        request.idempotencyKey,
                    );
                    if (repeatedInside) return repeatedInside;
                    const lockedProject =
                        await switchModel.getProject(projectUuid);
                    await this.assertCanSwitch(account, lockedProject);
                    const lockedHash =
                        WarehouseConnectionSwitchService.planHash({
                            account,
                            project: lockedProject,
                            request,
                            originalName: prepared.originalName,
                            connectionName: prepared.connectionName,
                            source: prepared.source,
                            credentials: prepared.credentials,
                        });
                    if (lockedHash !== request.planHash) {
                        throw new ConflictError(
                            WAREHOUSE_CONNECTION_SWITCH_PLAN_CHANGED_MESSAGE,
                        );
                    }
                    const originalWarehouseConnectionUuid =
                        await switchModel.createOriginal({
                            projectUuid,
                            name: prepared.originalName,
                            listAllDatabases: request.original.listAllDatabases,
                            additionalDatabases:
                                request.original.additionalDatabases,
                            createdByUserUuid: account.user.userUuid,
                        });
                    const extra = await connectionModel.createExtra(
                        await connectionModel.getProject(projectUuid),
                        {
                            name: prepared.connectionName,
                            warehouseType: prepared.credentials.type,
                            source: prepared.source,
                            listAllDatabases:
                                request.connection.listAllDatabases ?? false,
                            additionalDatabases:
                                request.connection.additionalDatabases ?? [],
                            createdByUserUuid: account.user.userUuid,
                        },
                    );
                    await switchModel.setMultiMode(projectUuid);
                    const eventUuid = await switchModel.insertSwitchEvent({
                        projectUuid,
                        actorUserUuid: account.user.userUuid,
                        plan: {
                            ...prepared.plan,
                            switched: {
                                originalWarehouseConnectionUuid,
                                warehouseConnectionUuid:
                                    extra.warehouseConnectionUuid,
                            },
                        } satisfies SwitchEventPlan,
                        planHash: request.planHash,
                        idempotencyKey: request.idempotencyKey,
                    });
                    return {
                        eventUuid,
                        originalWarehouseConnectionUuid,
                        warehouseConnectionUuid: extra.warehouseConnectionUuid,
                    };
                },
            );
        } catch (error) {
            if (isIdempotencyKeyConflict(error)) {
                const winner = await this.findRepeatedSwitch(
                    projectUuid,
                    request.idempotencyKey,
                );
                if (winner) return winner;
            }
            throw error;
        }

        this.recordSwitch(account, projectUuid, prepared, result);
        return result;
    }

    private async findRepeatedSwitchWith(
        switchModel: WarehouseConnectionSwitchModel,
        projectUuid: string,
        idempotencyKey: string,
    ): Promise<WarehouseConnectionSwitchResult | null> {
        const event =
            await switchModel.findEventByIdempotencyKey(idempotencyKey);
        if (!event) return null;
        if (
            event.projectUuid !== projectUuid ||
            event.event !== 'switched_to_multi'
        ) {
            throw new ConflictError(IDEMPOTENCY_KEY_USED_MESSAGE);
        }
        const { switched } = event.plan as SwitchEventPlan;
        return {
            eventUuid: event.eventUuid,
            originalWarehouseConnectionUuid:
                switched.originalWarehouseConnectionUuid,
            warehouseConnectionUuid: switched.warehouseConnectionUuid,
        };
    }

    private recordSwitch(
        account: RegisteredAccount,
        projectUuid: string,
        prepared: PreparedSwitch,
        result: WarehouseConnectionSwitchResult,
    ): void {
        const { organizationUuid } = prepared;
        try {
            logAuditEvent(
                createAuditLogEvent(
                    createActorFromAccount(account),
                    'update',
                    {
                        type: 'Project',
                        organizationUuid,
                        projectUuid,
                        metadata: {
                            event: 'switched_to_multi',
                            eventUuid: result.eventUuid,
                            warehouseConnectionUuid:
                                result.warehouseConnectionUuid,
                            connectionName: prepared.connectionName,
                        },
                    },
                    {},
                    'allowed',
                ),
            );
        } catch (error) {
            this.logger.warn(
                'Failed to write the connection switch audit event',
                {
                    error,
                },
            );
        }
        try {
            this.analytics.track({
                event: 'warehouse_connections.switched_to_multi',
                userId: account.user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    warehouseType: prepared.credentials.type,
                },
            });
        } catch (error) {
            this.logger.warn(
                'Failed to track the connection switch analytics event',
                { error },
            );
        }
    }
}
