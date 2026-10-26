import {
    AgentCapability,
    DbtProjectType,
    FeatureFlags,
    ProjectMemberRole,
    RequestMethod,
    type AgentConnectionExecution,
    type AgentConnectionGrant,
    type AgentConnectionTaskEffect,
    type SchedulerTaskName,
} from '@lightdash/common';
import { run, type Job, type Runner, type TaskList } from 'graphile-worker';
import knex from 'knex';
import { randomUUID } from 'node:crypto';
import { PreAggregateModel } from '../../../ee/models/PreAggregateModel';
import { PreAggregateMaterializationService } from '../../../ee/services/PreAggregateMaterializationService/PreAggregateMaterializationService';
import { AppModel } from '../../../models/AppModel';
import { CatalogModel } from '../../../models/CatalogModel/CatalogModel';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { DeploySessionModel } from '../../../models/DeploySessionModel';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { JobModel } from '../../../models/JobModel/JobModel';
import { OrganizationWarehouseCredentialsModel } from '../../../models/OrganizationWarehouseCredentialsModel';
import { ProjectCompileLogModel } from '../../../models/ProjectCompileLogModel';
import { ProjectDbtSourcesModel } from '../../../models/ProjectDbtSourcesModel';
import { ProjectParametersModel } from '../../../models/ProjectParametersModel';
import { SavedChartModel } from '../../../models/SavedChartModel';
import { SchedulerModel } from '../../../models/SchedulerModel';
import { TagsModel } from '../../../models/TagsModel';
import { UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { ValidationModel } from '../../../models/ValidationModel/ValidationModel';
import { WarehouseConnectionCompileModel } from '../../../models/WarehouseConnectionCompileModel/WarehouseConnectionCompileModel';
import { WarehouseConnectionModel } from '../../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { SchedulerClient } from '../../../scheduler/SchedulerClient';
import { SchedulerWorker } from '../../../scheduler/SchedulerWorker';
import { agentExecutionContext } from '../../../services/AiAccessService/agentExecutionContext';
import { CatalogService } from '../../../services/CatalogService/CatalogService';
import { DeployService } from '../../../services/DeployService';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import { SchedulerService } from '../../../services/SchedulerService/SchedulerService';
import { UserService } from '../../../services/UserService';
import { ValidationService } from '../../../services/ValidationService/ValidationService';
import { type MigratedDatabase } from '../../../testing/migratedDatabase';
import { captureAgentConnectionTask } from '../../../utils/agentConnectionExecution';
import {
    connectionFixture,
    connectionTestConfig,
    encryptionUtil,
    matrix,
} from './agentConnectionFixture.mock';
import {
    githubDbtConnection,
    postgresWarehouse,
} from './multiConnectionCompileFixtures';

export const evidenceResources = () => {
    const disposers: (() => Promise<unknown>)[] = [];
    const pending = new Set<Promise<unknown>>();
    const track = <T>(operation: Promise<T>): Promise<T> => {
        pending.add(operation);
        void operation.then(
            () => pending.delete(operation),
            () => pending.delete(operation),
        );
        return operation;
    };
    const settle = async () => {
        if (pending.size > 0) {
            await Promise.allSettled([...pending]);
            await settle();
        }
    };
    return {
        track,
        settle,
        add: (dispose: () => Promise<unknown>) => disposers.push(dispose),
        close: async () => {
            const errors: unknown[] = [];
            await disposers
                .splice(0)
                .reverse()
                .reduce(async (previous, dispose) => {
                    await previous;
                    try {
                        await dispose();
                    } catch (error) {
                        errors.push(error);
                    }
                }, Promise.resolve());
            if (errors.length)
                throw new AggregateError(
                    errors,
                    'Evidence resource cleanup failed',
                );
        },
    };
};

class EvidenceSchedulerClient extends SchedulerClient {
    constructor(
        args: ConstructorParameters<typeof SchedulerClient>[0],
        private readonly resources: ReturnType<typeof evidenceResources>,
    ) {
        super(args);
    }

    override generateValidation(
        ...args: Parameters<SchedulerClient['generateValidation']>
    ) {
        return this.resources.track(super.generateValidation(...args));
    }

    override replaceCustomFields(
        ...args: Parameters<SchedulerClient['replaceCustomFields']>
    ) {
        return this.resources.track(super.replaceCustomFields(...args));
    }

    override indexCatalog(
        ...args: Parameters<SchedulerClient['indexCatalog']>
    ) {
        return this.resources.track(super.indexCatalog(...args));
    }
}

class EvidenceWorker extends SchedulerWorker {
    tasks(names: SchedulerTaskName[]) {
        return Object.fromEntries(
            Object.entries(super.getFullTaskList()).filter(([name]) =>
                names.includes(name as SchedulerTaskName),
            ),
        );
    }

    protected getCronItems() {
        return [];
    }
}

export const queueEvidenceFixture = async (
    migrated: MigratedDatabase,
    resources: ReturnType<typeof evidenceResources>,
) => {
    const { database } = migrated;
    const f = await connectionFixture(database);
    const retainedProjectUuid = await f.createProject();
    const mutation = knex({
        client: 'pg',
        connection: migrated.connectionUri,
        pool: { min: 0, max: 2 },
    });
    resources.add(() => mutation.destroy());
    await database('project_memberships')
        .where('user_id', f.user.user_id)
        .update({ role: ProjectMemberRole.ADMIN });
    f.users.invalidateSessionUserCache(f.userUuid);
    const user = await f.users.findSessionUserAndOrgByUuid(
        f.userUuid,
        f.organizationUuid,
    );
    const capabilities = [
        AgentCapability.DeployUpload,
        AgentCapability.ContentWrite,
        AgentCapability.Query,
        AgentCapability.ReadDiscover,
    ];
    const policy = await f.savePolicy({
        systemRoleMatrix: { ...matrix([]), admin: capabilities },
    });
    const grant = await f.grants.create({
        organizationUuid: f.organizationUuid,
        subjectUserUuid: f.userUuid,
        clientId: 'lightdash-cli',
        name: 'Queue evidence',
        resource: connectionTestConfig.siteUrl,
        approvedCapabilities: capabilities,
        approvedProjectUuids: [f.projectUuid, retainedProjectUuid],
        resourceConstraints: {
            version: 2,
            projectCapabilities: {
                [f.projectUuid]: capabilities,
                [retainedProjectUuid]: capabilities,
            },
        },
        approvalPolicyVersion: policy.version,
        approvedByUserUuid: f.userUuid,
        approvalRequestUuid: randomUUID(),
        expiresAt: new Date(Date.now() + 86400000),
    });
    const familyUuid = randomUUID();
    await f.grants.bindRefreshFamily({
        organizationUuid: f.organizationUuid,
        grantUuid: grant.grantUuid,
        familyUuid,
    });
    const execution: AgentConnectionExecution = {
        grantUuid: grant.grantUuid,
        revision: grant.grantRevision,
        subjectUserUuid: f.userUuid,
        organizationUuid: f.organizationUuid,
        clientId: 'lightdash-cli',
        resource: grant.resource,
        refreshFamilyUuid: familyUuid,
        scopes: ['read', 'write'],
        operation: { kind: 'rest', key: 'ProjectController.refresh' },
    };
    const { scope } = await f.executions.assertActiveExecution(execution, {
        projectUuid: f.projectUuid,
        capabilities,
        recheckOperation: true,
    });
    const inConnection = <T>(fn: () => T) =>
        agentExecutionContext.run(scope, fn);
    const lightdashConfig = {
        ...connectionTestConfig,
        database: {
            ...connectionTestConfig.database,
            connectionUri: migrated.connectionUri,
        },
        preAggregates: {
            ...connectionTestConfig.preAggregates,
            enabled: false,
        },
        scheduler: { ...connectionTestConfig.scheduler, jobTimeout: 60000 },
    };
    const analytics = { track: vi.fn(), trackAccount: vi.fn() };
    const featureFlagModel = new FeatureFlagModel({
        database,
        lightdashConfig,
    });
    const schedulerModel = new SchedulerModel({ database });
    const schedulerClient = new EvidenceSchedulerClient(
        {
            lightdashConfig,
            analytics,
            schedulerModel,
            featureFlagModel,
        } as never,
        resources,
    );
    resources.add(async () => (await schedulerClient.graphileUtils).release());
    resources.add(resources.settle);
    const jobModel = new JobModel({ database });
    const catalogModel = new CatalogModel({ database, lightdashConfig });
    const tagsModel = new TagsModel({ database });
    const parameters = new ProjectParametersModel({ database });
    const compileLogs = new ProjectCompileLogModel({ database });
    const preAggregateModel = new PreAggregateModel({ database });
    const savedChartModel = new SavedChartModel({ database, lightdashConfig });
    const organizationWarehouseCredentialsModel =
        new OrganizationWarehouseCredentialsModel({ database, encryptionUtil });
    const warehouseConnectionModel = new WarehouseConnectionModel({
        database,
        encryptionUtil,
        organizationWarehouseCredentialsModel,
    });
    const projectDbtSourcesModel = new ProjectDbtSourcesModel({
        database,
        encryptionUtil,
    });
    const warehouseConnectionCompileModel = new WarehouseConnectionCompileModel(
        { database },
    );
    const service = new ProjectService({
        lightdashConfig,
        analytics,
        projectModel: f.projects,
        jobModel,
        projectDbtSourcesModel,
        warehouseConnectionModel,
        warehouseConnectionCompileModel,
        userWarehouseCredentialsModel: new UserWarehouseCredentialsModel({
            database,
            encryptionUtil,
        }),
        organizationWarehouseCredentialsModel,
        catalogModel,
        tagsModel,
        projectParametersModel: parameters,
        projectCompileLogModel: compileLogs,
        preAggregateModel,
        savedChartModel,
        schedulerClient,
        getAgentConnectionGrantService: () => f.executions,
        featureFlagModel,
    } as never);
    const catalogService = new CatalogService({
        lightdashConfig,
        analytics,
        projectModel: f.projects,
        catalogModel,
        savedChartModel,
        tagsModel,
    } as never);
    const schedulerService = new SchedulerService({ schedulerModel } as never);
    const userService = new UserService({
        lightdashConfig,
        userModel: f.users,
    } as never);
    const validationService = new ValidationService({
        lightdashConfig,
        analytics,
        projectModel: f.projects,
        validationModel: new ValidationModel({ database }),
        savedChartModel,
        schedulerClient,
        dashboardModel: new DashboardModel({ database }),
        appModel: new AppModel({ database }),
    } as never);
    const sessions = new DeploySessionModel(database);
    const deploy = new DeployService({
        deploySessionModel: sessions,
        projectModel: f.projects,
        projectService: service,
        schedulerClient,
    });
    const materializationService = new PreAggregateMaterializationService({
        lightdashConfig,
        analytics,
        projectModel: f.projects,
        preAggregateModel,
    } as never);
    const worker = new EvidenceWorker({
        lightdashConfig,
        analytics,
        schedulerClient,
        schedulerService,
        projectService: service,
        catalogService,
        userService,
        validationService,
        preAggregateMaterializationService: materializationService,
        getAgentConnectionGrantService: () => f.executions,
    } as never);
    let runner: Runner | undefined;
    const start = async (tasks: SchedulerTaskName[]) => {
        if (runner) throw new Error('A runner is already active');
        runner = await run({
            connectionString: migrated.connectionUri,
            taskList: worker.tasks(tasks) as TaskList,
            concurrency: 1,
            maxPoolSize: 2,
            pollInterval: 25,
            noHandleSignals: true,
        });
    };
    const stop = async () => {
        await runner?.stop();
        runner = undefined;
    };
    resources.add(async () => {
        try {
            if (runner)
                await vi.waitFor(
                    async () => {
                        const locked = await database(
                            'graphile_worker.jobs',
                        ).whereNotNull('locked_by');
                        expect(locked).toEqual([]);
                    },
                    { timeout: 15000, interval: 25 },
                );
        } finally {
            await stop();
        }
    });
    const rows = () =>
        database<Job & { payload: Record<string, unknown> }>(
            'graphile_worker.jobs',
        )
            .select('*')
            .orderBy('id');
    const logs = (id: string) =>
        database('scheduler_log').where('job_id', id).orderBy('created_at');
    const requiredCapability = {
        compileProject: AgentCapability.DeployUpload,
        validateProject: AgentCapability.DeployUpload,
        replaceCustomFields: AgentCapability.ContentWrite,
        materializePreAggregate: AgentCapability.Query,
    };
    const refuse = async (
        reason: string,
        effect: AgentConnectionTaskEffect,
    ) => {
        const row = mutation<{
            revoked_at: Date;
            approved_at: Date;
            expires_at: Date;
            approved_project_uuids: string[];
            approved_capabilities: AgentCapability[];
            resource_constraints: AgentConnectionGrant['resourceConstraints'];
        }>('agent_connection_grants').where(
            'agent_connection_grant_uuid',
            grant.grantUuid,
        );
        switch (reason) {
            case 'revoked':
                await row.update({ revoked_at: new Date() });
                break;
            case 'expired':
                await row.update({
                    approved_at: new Date(Date.now() - 86400000),
                    expires_at: new Date(Date.now() - 1000),
                });
                break;
            case 'project removed':
                await row.update({
                    approved_project_uuids: [retainedProjectUuid],
                    resource_constraints: {
                        version: 2,
                        projectCapabilities: {
                            [retainedProjectUuid]: capabilities,
                        },
                    },
                });
                break;
            case 'required action removed': {
                const remaining = capabilities.filter(
                    (capability) => capability !== requiredCapability[effect],
                );
                await row.update({
                    approved_capabilities: remaining,
                    resource_constraints: {
                        version: 2,
                        projectCapabilities: {
                            [f.projectUuid]: remaining,
                            [retainedProjectUuid]: remaining,
                        },
                    },
                });
                break;
            }
            case 'person deactivated':
                await mutation('users')
                    .where('user_uuid', f.userUuid)
                    .update({ is_active: false });
                break;
            default:
                throw new Error('Unknown refusal');
        }
    };
    const enqueue = async (effect: AgentConnectionTaskEffect) =>
        inConnection(async () => {
            const owner = {
                userUuid: f.userUuid,
                organizationUuid: f.organizationUuid,
                projectUuid: f.projectUuid,
            };
            const payload = {
                ...owner,
                ...captureAgentConnectionTask(effect, owner),
            };
            switch (effect) {
                case 'compileProject':
                    return service.scheduleCompileProject(
                        user,
                        f.projectUuid,
                        RequestMethod.CLI,
                    );
                case 'validateProject':
                    return schedulerClient.generateValidation({
                        ...payload,
                        context: 'dbt_refresh',
                    });
                case 'replaceCustomFields':
                    return schedulerClient.replaceCustomFields(payload);
                case 'materializePreAggregate':
                    return schedulerClient.materializePreAggregate({
                        ...payload,
                        preAggregateDefinitionUuid: randomUUID(),
                        trigger: 'compile',
                    });
                default:
                    throw new Error('Unknown effect');
            }
        });
    const configureMultiCompile = async (multi = true) => {
        const credentials = postgresWarehouse(migrated.databaseName);
        const [project] = await database('projects')
            .where('project_uuid', f.projectUuid)
            .update({
                connection_mode: multi ? 'multi' : 'single',
                dbt_connection_type: DbtProjectType.GITHUB,
                dbt_connection: encryptionUtil.encrypt(
                    JSON.stringify(githubDbtConnection('org/primary')),
                ),
            } as never)
            .returning('*');
        await database('warehouse_credentials').insert({
            project_id: project.project_id,
            warehouse_type: credentials.type,
            encrypted_credentials: encryptionUtil.encrypt(
                JSON.stringify(credentials),
            ),
        });
        if (!multi) return;
        await database('warehouse_connections').insert({
            project_uuid: f.projectUuid,
            is_original: true,
            name: 'Original',
        });
        await projectDbtSourcesModel.createSource(f.projectUuid, {
            name: 'overlay',
            isPrimary: false,
            precedence: 0,
            dbtConnection: githubDbtConnection('org/overlay'),
            warehouseLocation: { database: null, schema: null },
        });
        await Promise.all(
            ['extra_one', 'extra_two'].map(async (name) => {
                const extra = await warehouseConnectionModel.createExtra(
                    await warehouseConnectionModel.getProject(f.projectUuid),
                    {
                        name,
                        warehouseType: credentials.type,
                        source: { kind: 'project', credentials },
                        listAllDatabases: false,
                        additionalDatabases: [],
                        createdByUserUuid: f.userUuid,
                    },
                );
                const source = await projectDbtSourcesModel.createSource(
                    f.projectUuid,
                    {
                        name,
                        isPrimary: false,
                        precedence: name === 'extra_one' ? 1 : 2,
                        dbtConnection: githubDbtConnection(`org/${name}`),
                        warehouseLocation: { database: null, schema: null },
                    },
                );
                await warehouseConnectionCompileModel.bindDbtSource(
                    f.projectUuid,
                    source.projectDbtSourceUuid,
                    extra.warehouseConnectionUuid,
                );
            }),
        );
    };
    return {
        ...f,
        user,
        grant,
        retainedProjectUuid,
        requiredCapability,
        execution,
        inConnection,
        service,
        schedulerClient,
        schedulerModel,
        compileLogs,
        catalogModel,
        catalogService,
        jobModel,
        validationService,
        materializationService,
        userService,
        sessions,
        deploy,
        preAggregateModel,
        start,
        stop,
        rows,
        logs,
        refuse,
        enqueue,
        configureMultiCompile,
        warehouseConnectionCompileModel,
        warehouseConnectionModel,
    };
};

export const evidenceGate = (boundary: string) => {
    let arrived = false;
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
        release = resolve;
    });
    return {
        waitForArrival: () =>
            vi.waitFor(
                () =>
                    expect(arrived, `Gate not reached: ${boundary}`).toBe(true),
                { timeout: 10000, interval: 25 },
            ),
        release,
        pause: async () => {
            arrived = true;
            await released;
        },
    };
};

export const installEvidenceJson = () => {
    const previous = Object.getOwnPropertyDescriptor(
        BigInt.prototype,
        'toJSON',
    );
    Reflect.defineProperty(BigInt.prototype, 'toJSON', {
        configurable: true,
        value() {
            return this.toString();
        },
    });
    return () => {
        if (previous)
            Reflect.defineProperty(BigInt.prototype, 'toJSON', previous);
        else Reflect.deleteProperty(BigInt.prototype, 'toJSON');
    };
};
