import {
    AgentActorSurface,
    AgentCapability,
    DbtProjectType,
    JobStatusType,
    JobStepType,
    JobType,
    ProjectMemberRole,
    RequestMethod,
    type AgentConnectionExecution,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { JobModel } from '../../../models/JobModel/JobModel';
import { OrganizationWarehouseCredentialsModel } from '../../../models/OrganizationWarehouseCredentialsModel';
import { ProjectCompileLogModel } from '../../../models/ProjectCompileLogModel';
import { ProjectDbtSourcesModel } from '../../../models/ProjectDbtSourcesModel';
import { UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { WarehouseConnectionCompileModel } from '../../../models/WarehouseConnectionCompileModel/WarehouseConnectionCompileModel';
import { WarehouseConnectionModel } from '../../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import {
    agentExecutionContext,
    createAgentExecutionContext,
} from '../../../services/AiAccessService/agentExecutionContext';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
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

export const compileCredentialGateFixture = async (
    database: Knex,
    databaseName: string,
    factoryResolution: boolean,
    multi = false,
    credentials: CreateWarehouseCredentials = postgresWarehouse(databaseName),
) => {
    const f = await connectionFixture(database);
    await database('project_memberships')
        .where('user_id', f.user.user_id)
        .update({ role: ProjectMemberRole.ADMIN });
    await f.savePolicy({
        systemRoleMatrix: {
            ...matrix([]),
            admin: [AgentCapability.DeployUpload],
        },
    });
    const user = await f.users.findSessionUserAndOrgByUuid(
        f.userUuid,
        f.organizationUuid,
    );
    const grantConnection = await f.createConnection([
        AgentCapability.DeployUpload,
    ]);
    const grant = await f.grants.find(grantConnection.grant.grantUuid);
    if (!grant?.refreshFamilyUuid) throw new Error('Missing bound grant');
    const execution: AgentConnectionExecution = {
        grantUuid: grant.grantUuid,
        revision: grant.grantRevision,
        subjectUserUuid: f.userUuid,
        organizationUuid: f.organizationUuid,
        clientId: 'lightdash-cli',
        resource: grant.resource,
        refreshFamilyUuid: grant.refreshFamilyUuid,
        scopes: ['read', 'write'],
        operation: { kind: 'rest', key: 'ProjectController.refresh' },
    };
    const scope = createAgentExecutionContext({
        account: f.account,
        surface: AgentActorSurface.CLI,
        clientId: 'lightdash-cli',
        agentUuid: null,
        agentIdentityEnabled: true,
        agentConnectionExecution: execution,
    });
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
    const warehouseConnectionModel = new WarehouseConnectionModel({
        database,
        encryptionUtil,
        organizationWarehouseCredentialsModel:
            new OrganizationWarehouseCredentialsModel({
                database,
                encryptionUtil,
            }),
    });
    const projectDbtSourcesModel = new ProjectDbtSourcesModel({
        database,
        encryptionUtil,
    });
    const warehouseConnectionCompileModel = new WarehouseConnectionCompileModel(
        { database },
    );
    let extraUuid: string | null = null;
    if (multi) {
        await database('warehouse_connections').insert({
            project_uuid: f.projectUuid,
            is_original: true,
            name: 'Original',
        });
        const extra = await warehouseConnectionModel.createExtra(
            await warehouseConnectionModel.getProject(f.projectUuid),
            {
                name: 'Extra',
                warehouseType: credentials.type,
                source: { kind: 'project', credentials },
                listAllDatabases: false,
                additionalDatabases: [],
                createdByUserUuid: f.userUuid,
            },
        );
        extraUuid = extra.warehouseConnectionUuid;
        const source = await projectDbtSourcesModel.createSource(
            f.projectUuid,
            {
                name: 'extra',
                isPrimary: false,
                precedence: 1,
                dbtConnection: githubDbtConnection('org/extra'),
                warehouseLocation: { database: null, schema: null },
            },
        );
        await warehouseConnectionCompileModel.bindDbtSource(
            f.projectUuid,
            source.projectDbtSourceUuid,
            extraUuid,
        );
    }
    const jobModel = new JobModel({ database });
    const jobUuid = randomUUID();
    await jobModel.create(
        {
            jobUuid,
            jobType: JobType.COMPILE_PROJECT,
            jobStatus: JobStatusType.STARTED,
            projectUuid: f.projectUuid,
            userUuid: f.userUuid,
            steps: [
                { stepType: JobStepType.TESTING_ADAPTOR },
                { stepType: JobStepType.COMPILING },
            ],
        },
        false,
    );
    const schedulerClient = {
        indexCatalog: vi.fn(async () => 'index-job'),
        generateValidation: vi.fn(async () => {}),
    };
    const service = new ProjectService({
        lightdashConfig: {
            ...connectionTestConfig,
            warehouseClient: {
                ...connectionTestConfig.warehouseClient,
                resolveCompileCredentials: factoryResolution,
                resolveTestAndCompileCredentials: factoryResolution,
            },
        },
        analytics: { track: vi.fn() },
        projectModel: f.projects,
        projectDbtSourcesModel,
        warehouseConnectionCompileModel,
        warehouseConnectionModel,
        userWarehouseCredentialsModel: new UserWarehouseCredentialsModel({
            database,
            encryptionUtil,
        }),
        organizationWarehouseCredentialsModel:
            new OrganizationWarehouseCredentialsModel({
                database,
                encryptionUtil,
            }),
        jobModel,
        projectCompileLogModel: new ProjectCompileLogModel({ database }),
        featureFlagModel: { get: async () => ({ id: 'flag', enabled: false }) },
        getAgentConnectionGrantService: () => f.executions,
        preAggregateModel: {
            getPreAggregateDefinitionsForProject: async () => [],
        },
        catalogModel: {
            getCatalogItemsWithTags: async () => [],
            getCatalogItemsWithIcons: async () => [],
            getAllMetricsTreeEdges: async () => [],
            getAllMetricsTreeNodes: async () => [],
        },
        schedulerClient,
        tagsModel: {
            replaceYamlTags: async () => ({ yamlTagsToCreateOrUpdate: [] }),
        },
        projectParametersModel: {
            replace: async () => {},
            find: async () => [],
        },
    } as never);
    const run = () =>
        service.compileProject(user, f.projectUuid, RequestMethod.CLI, jobUuid);
    const deploy = () =>
        service.testAndCompileProject(
            user,
            f.projectUuid,
            RequestMethod.CLI,
            jobUuid,
        );
    const inConnection = <T>(fn: () => T) =>
        agentExecutionContext.run(scope, fn);
    const refuse = async (reason: string) => {
        const row = database('agent_connection_grants').where(
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
                } as never);
                break;
            case 'project narrowed':
                await row.update({ approved_project_uuids: [] } as never);
                break;
            case 'action narrowed':
                await row.update({ approved_capabilities: [] } as never);
                break;
            case 'person deactivated':
                await database('users')
                    .where('user_uuid', f.userUuid)
                    .update({ is_active: false });
                break;
            default:
                throw new Error('Unknown refusal');
        }
    };
    const credentialRows = async () => ({
        original: await database('warehouse_credentials').where(
            'project_id',
            project.project_id,
        ),
        extra: await database('warehouse_connections')
            .where('project_uuid', f.projectUuid)
            .orderBy('warehouse_connection_uuid'),
        personal: await database('user_warehouse_credentials').where(
            'user_uuid',
            f.userUuid,
        ),
        organization: await database(
            'organization_warehouse_credentials',
        ).where('organization_uuid', f.organizationUuid),
    });
    return {
        ...f,
        service,
        user,
        jobUuid,
        jobModel,
        run,
        deploy,
        inConnection,
        refuse,
        credentialRows,
        extraUuid,
        schedulerClient,
        warehouseConnectionModel,
        projectDbtSourcesModel,
        warehouseConnectionCompileModel,
    };
};
