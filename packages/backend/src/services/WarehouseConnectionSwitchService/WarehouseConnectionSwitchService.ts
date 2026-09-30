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
    type WarehouseConnectionTestResults,
} from '@lightdash/common';
import { createHash } from 'node:crypto';
import { DatabaseError } from 'pg';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { trackSafely } from '../../analytics/trackSafely';
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
import {
    ENTITLEMENT_REASON,
    getMultipleConnectionsBlockReason,
    ROLLOUT_REASON,
    WAREHOUSE_TYPE_REASON,
} from '../WarehouseConnectionService/multipleConnectionsGate';
import { type WarehouseCredentialPolicy } from '../WarehouseConnectionService/WarehouseConnectionService';

export const DEFAULT_PROJECT_ONLY_REASON =
    'Only a default project can have multiple connections.';
export const ORIGINAL_ORGANIZATION_CREDENTIALS_REASON =
    'A project whose warehouse uses organisation credentials cannot have multiple connections yet.';
export const EXTRA_CONNECTION_WAREHOUSE_TYPE_MISMATCH_MESSAGE =
    'An extra connection must use the same warehouse type as the original connection.';
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
    extraListAllDatabases: boolean;
    extraAdditionalDatabaseCount: number;
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

    private readonly trackedTestErrors = new WeakSet<object>();

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

    private async trackSwitchRefusal(
        account: RegisteredAccount,
        projectUuid: string,
        operation: 'switch_preview' | 'switch',
        error: unknown,
        credentialSource: 'project' | 'organization' | null = null,
    ): Promise<boolean> {
        const message = error instanceof Error ? error.message : null;
        let reason:
            | 'already_multi'
            | 'unsupported_project'
            | 'organization_credentials'
            | 'license_required'
            | 'feature_disabled'
            | 'warehouse_type_mismatch'
            | 'plan_changed'
            | null = null;
        if (message === WAREHOUSE_CONNECTION_ALREADY_MULTI_MESSAGE) {
            reason = 'already_multi';
        } else if (message === DEFAULT_PROJECT_ONLY_REASON) {
            reason = 'unsupported_project';
        } else if (message === ORIGINAL_ORGANIZATION_CREDENTIALS_REASON) {
            reason = 'organization_credentials';
        } else if (message === ENTITLEMENT_REASON) {
            reason = 'license_required';
        } else if (message === ROLLOUT_REASON) {
            reason = 'feature_disabled';
        } else if (message === WAREHOUSE_TYPE_REASON) {
            reason = 'warehouse_type_mismatch';
        } else if (
            message === WAREHOUSE_CONNECTION_SWITCH_PLAN_CHANGED_MESSAGE
        ) {
            reason = 'plan_changed';
        }
        if (reason === null) return false;
        try {
            const project = await this.switchModel.getProject(projectUuid);
            const connectionCount =
                project.connectionMode === 'multi'
                    ? (await this.connectionModel.list(project)).length
                    : 1;
            trackSafely(() =>
                this.analytics.track({
                    event: 'warehouse_connection.action_refused',
                    userId: account.user.userUuid,
                    properties: {
                        organizationId: project.organizationUuid,
                        projectId: projectUuid,
                        warehouseConnectionId: null,
                        warehouseType: project.originalWarehouseType,
                        connectionKind: null,
                        credentialSource,
                        connectionCount,
                        operation,
                        reason,
                    },
                }),
            );
        } catch (trackingError) {
            this.logger.warn('Failed to track switch refusal', {
                error: trackingError,
            });
        }
        return true;
    }

    private async trackPreviewFailure(
        account: RegisteredAccount,
        projectUuid: string,
        request: ApiWarehouseConnectionSwitchRequest,
        error: unknown,
    ): Promise<void> {
        const message = error instanceof Error ? error.message : null;
        if (
            (error !== null &&
                typeof error === 'object' &&
                this.trackedTestErrors.has(error)) ||
            message === WAREHOUSE_CONNECTION_ALREADY_MULTI_MESSAGE ||
            message === DEFAULT_PROJECT_ONLY_REASON ||
            message === ORIGINAL_ORGANIZATION_CREDENTIALS_REASON ||
            message === ENTITLEMENT_REASON ||
            message === ROLLOUT_REASON ||
            message === WAREHOUSE_TYPE_REASON ||
            message?.startsWith('Warehouse connection test failed')
        ) {
            return;
        }
        try {
            const project = await this.switchModel.getProject(projectUuid);
            const connectionCount =
                project.connectionMode === 'multi'
                    ? (await this.connectionModel.list(project)).length
                    : 1;
            const credentialSource =
                WarehouseConnectionSwitchService.credentialSourceFromRequest(
                    request.connection,
                );
            let previewReason:
                | 'invalid_request'
                | 'name_conflict'
                | 'warehouse_type_mismatch'
                | 'access_denied'
                | 'other' = 'other';
            if (message === WAREHOUSE_CONNECTION_NAME_CONFLICT_MESSAGE) {
                previewReason = 'name_conflict';
            } else if (
                message === EXTRA_CONNECTION_WAREHOUSE_TYPE_MISMATCH_MESSAGE
            ) {
                previewReason = 'warehouse_type_mismatch';
            } else if (error instanceof ParameterError) {
                previewReason = 'invalid_request';
            } else if (error instanceof ForbiddenError) {
                previewReason = 'access_denied';
            }
            trackSafely(() =>
                this.analytics.track({
                    event: 'warehouse_connections.switch_preview_failed',
                    userId: account.user.userUuid,
                    properties: {
                        organizationId: project.organizationUuid,
                        projectId: projectUuid,
                        warehouseConnectionId: null,
                        warehouseType: project.originalWarehouseType,
                        connectionKind: null,
                        credentialSource,
                        connectionCount,
                        reason: previewReason,
                    },
                }),
            );
        } catch (trackingError) {
            this.logger.warn('Failed to track switch preview failure', {
                error: trackingError,
            });
        }
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

    private static credentialSourceFromRequest(
        request: ApiCreateWarehouseConnectionRequest,
    ): 'project' | 'organization' | null {
        if (request.organizationWarehouseCredentialsUuid !== undefined) {
            return 'organization';
        }
        if (request.warehouseConnection !== undefined) {
            return 'project';
        }
        return null;
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
        projectUuid: string,
        credentials: CreateWarehouseCredentials,
        operation: 'switch_preview' | 'switch',
        credentialSource: 'project' | 'organization',
    ): Promise<void> {
        let result: WarehouseConnectionTestResults;
        try {
            result =
                await this.credentialPolicy.testWarehouseConnectionCredentials(
                    account,
                    organizationUuid,
                    credentials,
                );
        } catch (error) {
            if (error !== null && typeof error === 'object') {
                this.trackedTestErrors.add(error);
            }
            trackSafely(() =>
                this.analytics.track({
                    event: 'warehouse_connection.test_completed',
                    userId: account.user.userUuid,
                    properties: {
                        organizationId: organizationUuid,
                        projectId: projectUuid,
                        warehouseConnectionId: null,
                        warehouseType: credentials.type,
                        connectionKind: 'extra',
                        credentialSource,
                        connectionCount: 1,
                        operation,
                        result: 'failure',
                        reason: 'connection_test_error',
                    },
                }),
            );
            throw error;
        }
        trackSafely(() =>
            this.analytics.track({
                event: 'warehouse_connection.test_completed',
                userId: account.user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    warehouseConnectionId: null,
                    warehouseType: credentials.type,
                    connectionKind: 'extra',
                    credentialSource,
                    connectionCount: 1,
                    operation,
                    result: result.ok ? 'success' : 'failure',
                    reason: result.ok ? null : 'connection_test_failed',
                },
            }),
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
        operation: 'switch_preview' | 'switch',
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
                EXTRA_CONNECTION_WAREHOUSE_TYPE_MISMATCH_MESSAGE,
            );
        }
        await this.assertConnectionWorks(
            account,
            project.organizationUuid,
            projectUuid,
            credentials,
            operation,
            source.kind,
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
            extraListAllDatabases: request.connection.listAllDatabases ?? false,
            extraAdditionalDatabaseCount:
                request.connection.additionalDatabases?.length ?? 0,
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
        let prepared: PreparedSwitch;
        try {
            prepared = await this.prepare(
                account,
                projectUuid,
                request,
                'switch_preview',
            );
        } catch (error) {
            await this.trackSwitchRefusal(
                account,
                projectUuid,
                'switch_preview',
                error,
                WarehouseConnectionSwitchService.credentialSourceFromRequest(
                    request.connection,
                ),
            );
            await this.trackPreviewFailure(
                account,
                projectUuid,
                request,
                error,
            );
            throw error;
        }
        trackSafely(() =>
            this.analytics.track({
                event: 'warehouse_connections.switch_previewed',
                userId: account.user.userUuid,
                properties: {
                    organizationId: prepared.organizationUuid,
                    projectId: projectUuid,
                    warehouseConnectionId: null,
                    warehouseType: prepared.credentials.type,
                    connectionKind: 'extra',
                    credentialSource: prepared.source.kind,
                    connectionCount: 1,
                    listAllDatabases:
                        request.connection.listAllDatabases ?? false,
                    additionalDatabaseCount:
                        request.connection.additionalDatabases?.length ?? 0,
                    originalContentCount:
                        prepared.plan.staysOnOriginal.explores +
                        prepared.plan.staysOnOriginal.sqlCharts +
                        prepared.plan.staysOnOriginal.dbtSources,
                    personalCredentialsUserCount:
                        prepared.plan.personalCredentials
                            .usersWithPersonalCredentials,
                },
            }),
        );
        return prepared.plan;
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
        let prepared: PreparedSwitch;
        let result: WarehouseConnectionSwitchResult;
        try {
            prepared = await this.prepare(
                account,
                projectUuid,
                request,
                'switch',
            );
            if (prepared.plan.planHash !== request.planHash) {
                throw new ConflictError(
                    WAREHOUSE_CONNECTION_SWITCH_PLAN_CHANGED_MESSAGE,
                );
            }
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
            await this.trackSwitchRefusal(
                account,
                projectUuid,
                'switch',
                error,
                WarehouseConnectionSwitchService.credentialSourceFromRequest(
                    request.connection,
                ),
            );
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
        trackSafely(() =>
            this.analytics.track({
                event: 'warehouse_connections.switched_to_multi',
                userId: account.user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    warehouseConnectionId: result.warehouseConnectionUuid,
                    warehouseType: prepared.credentials.type,
                    connectionKind: 'extra',
                    credentialSource: prepared.source.kind,
                    connectionCount: 2,
                    listAllDatabases: prepared.extraListAllDatabases,
                    additionalDatabaseCount:
                        prepared.extraAdditionalDatabaseCount,
                    originalContentCount:
                        prepared.plan.staysOnOriginal.explores +
                        prepared.plan.staysOnOriginal.sqlCharts +
                        prepared.plan.staysOnOriginal.dbtSources,
                    personalCredentialsUserCount:
                        prepared.plan.personalCredentials
                            .usersWithPersonalCredentials,
                },
            }),
        );
    }
}
