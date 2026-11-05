import {
    AgentActorSurface,
    DimensionType,
    ProjectMemberRole,
    type Explore,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { fromSession } from '../../../auth/account/account';
import { PreAggregateModel } from '../../../ee/models/PreAggregateModel';
import Logger from '../../../logging/logger';
import { DeploySessionModel } from '../../../models/DeploySessionModel';
import { ProjectParametersModel } from '../../../models/ProjectParametersModel';
import { type default as SchedulerTask } from '../../../scheduler/SchedulerTask';
import { createAgentExecutionContext } from '../../../services/AiAccessService/agentExecutionContext';
import { NO_CLI_DEPLOY_SELECTION } from '../../../services/cliDeploy';
import { DeployService } from '../../../services/DeployService';
import { PreAggregateRefreshReference } from '../../../services/ProjectService/preAggregateRefresh.reference.mock';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import { validExplore } from '../../../services/ProjectService/ProjectService.mock';
import { connectionFixture } from './agentConnectionFixture.mock';

export const refreshFixture = async (database: Knex) => {
    const f = await connectionFixture(database);
    await database('project_memberships')
        .where('user_id', f.user.user_id)
        .update({ role: ProjectMemberRole.ADMIN });
    f.users.invalidateSessionUserCache(f.userUuid);
    const user = await f.users.findSessionUserAndOrgByUuid(
        f.userUuid,
        f.organizationUuid,
    );
    const account = fromSession(user, '');
    const scope = createAgentExecutionContext({
        account,
        surface: AgentActorSurface.CLI,
        clientId: 'lightdash-cli',
        agentUuid: null,
        agentIdentityEnabled: true,
        agentConnectionGrant: { grantUuid: randomUUID(), revision: 1 },
        agentConnectionExecution: {
            grantUuid: randomUUID(),
            revision: 1,
            subjectUserUuid: f.userUuid,
            organizationUuid: f.organizationUuid,
            clientId: 'lightdash-cli',
            resource: 'https://instance.example',
            refreshFamilyUuid: randomUUID(),
            scopes: ['read', 'write'],
            operation: { kind: 'rest', key: 'ProjectController.refresh' },
        },
    });
    const boundScope = {
        ...scope,
        claim:
            scope.claim === null
                ? null
                : {
                      ...scope.claim,
                      act: {
                          ...scope.claim.act,
                          agent_connection_grant: {
                              grantUuid:
                                  scope.agentConnectionExecution!.grantUuid,
                              revision: 1,
                          },
                      },
                  },
    };
    const preAggregateModel = new PreAggregateModel({ database });
    const parameters = new ProjectParametersModel({ database });
    const sessions = new DeploySessionModel(database);
    const jobs = {
        setPendingJobsToSkipped: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        tryJobStep: vi.fn(async (_id, _step, run) => run()),
    };
    const scheduler = {
        compileProject: vi.fn(),
        generateValidation: vi.fn(),
        indexCatalog: vi.fn(),
        materializePreAggregate: vi.fn(),
        schedulePreAggregateCronJobs: vi.fn(),
        replaceCustomFields: vi.fn(),
    };
    const service: ProjectService = Object.assign(
        Object.create(ProjectService.prototype),
        {
            projectModel: f.projects,
            preAggregateModel,
            projectParametersModel: parameters,
            projectDbtSourcesModel: {
                hasSources: vi.fn().mockResolvedValue(false),
                getSources: vi.fn().mockResolvedValue([]),
            },
            featureFlagModel: {
                get: vi.fn(async ({ featureFlagId }) => ({
                    id: featureFlagId,
                    enabled: false,
                })),
            },
            multiConnectionCompiler: {
                save: async (
                    projectUuid: string,
                    prepared: { exploreStream: AsyncIterable<Explore> },
                ) => {
                    const explores: Explore[] = [];
                    for await (const explore of prepared.exploreStream)
                        explores.push(explore);
                    return f.projects.saveExploresToCache(
                        projectUuid,
                        explores,
                        true,
                    );
                },
            },
            warehouseConnectionIdentityModel: {
                getExtraConnectionUuids: vi.fn().mockResolvedValue([]),
            },
            logger: Logger,
            analytics: { track: vi.fn() },
            jobModel: jobs,
            schedulerClient: scheduler,
        },
    );
    vi.spyOn(service, 'assertAgentConnectionEffect').mockResolvedValue(account);
    vi.spyOn(service, 'trackCliSourceDeploy').mockResolvedValue(undefined);
    const deploy = new DeployService({
        projectModel: f.projects,
        projectService: service,
        deploySessionModel: sessions,
        schedulerClient: scheduler as never,
    });
    const reference = new PreAggregateRefreshReference(
        f.projects,
        preAggregateModel,
    );
    const save = (explores: Explore[]) =>
        f.projects.saveExploresToCache(f.projectUuid, explores, true);
    const withCron = (cron: unknown): Explore =>
        ({
            ...validExplore,
            preAggregates: [
                {
                    name: 'daily',
                    dimensions: [],
                    metrics: [],
                    refresh: { cron },
                },
            ],
        }) as Explore;
    return {
        ...f,
        user,
        account,
        scope: boundScope,
        preAggregateModel,
        parameters,
        sessions,
        jobs,
        scheduler,
        service,
        deploy,
        reference,
        save,
        withCron,
    };
};

export const refreshOperation = async (
    f: Awaited<ReturnType<typeof refreshFixture>>,
    operation: string,
    incoming: Explore[],
) => {
    const { RequestMethod, WarehouseTypes } = await import('@lightdash/common');
    const { ExploreCompilationSummary } =
        await import('../../../utils/ExploreCompilationSummary');
    const { projectHooks } = await import('./launch-measurements/projectHooks');
    const hooks = projectHooks(f.service);
    const sink = vi
        .spyOn(hooks, 'saveExploresAndIndexCatalog')
        .mockImplementation(async (args) => {
            const summary = new ExploreCompilationSummary();
            await args.saveExplores(summary);
            return {
                indexCatalogJobUuid: 'fixture',
                errorCount: summary.report.errorExploresCount,
                total: summary.report.totalExploresCount,
            };
        });
    const adapter = {
        getDbtPackages: async () => ({}),
        prepareExploreStream: async () =>
            (async function* source() {
                yield* incoming;
            })(),
        getLightdashProjectConfig: async () => ({ parameters: {} }),
        destroy: async () => {},
    };
    vi.spyOn(hooks, 'withCompileAdapter').mockImplementation(
        async (_id, _user, consume) => consume({ adapter } as never),
    );
    vi.spyOn(hooks, 'resolveCompileAdapter').mockResolvedValue({
        adapter,
    } as never);
    vi.spyOn(hooks, 'getProjectContextFromAdapter').mockResolvedValue(
        undefined,
    );
    vi.spyOn(hooks, 'replaceYamlTagsWithoutPermissionCheck').mockResolvedValue(
        undefined,
    );
    vi.spyOn(hooks, 'deleteMergedManifestBestEffort').mockResolvedValue(
        undefined,
    );
    vi.spyOn(hooks, 'persistMergedManifest').mockResolvedValue(undefined);
    vi.spyOn(f.service, 'getWarehouseSqlBuilderSettings').mockResolvedValue({
        type: WarehouseTypes.POSTGRES,
    } as never);
    vi.spyOn(f.service, 'findExplores').mockImplementation(
        async ({ exploreNames }) =>
            f.projects.findExploresFromCache(
                f.projectUuid,
                'name',
                exploreNames,
            ),
    );
    Object.assign(f.service, {
        analytics: { track: vi.fn(), trackAccount: vi.fn() },
    });
    const args = {
        projectUuid: f.projectUuid,
        userUuid: f.userUuid,
        explores: incoming,
        compilationSource: 'cli_deploy' as const,
        complete: true,
    };
    let sessionUuid = '';
    if (['batch', 'finalize'].includes(operation))
        sessionUuid = await f.sessions.createSession(f.projectUuid, f.userUuid);
    if (operation === 'finalize')
        await f.sessions.addBatch(
            sessionUuid,
            f.projectUuid,
            incoming,
            0,
            true,
        );
    const payload = {
        name: 'guard_view',
        sql: 'select 1 as value',
        columns: [{ reference: 'value', type: DimensionType.NUMBER }],
    };
    if (operation === 'virtual-update')
        await f.service.createVirtualView(
            f.account,
            f.projectUuid,
            payload,
            false,
        );
    const run = (): Promise<unknown> => {
        switch (operation) {
            case 'schedule':
                return f.service.scheduleCompileProject(
                    f.user,
                    f.projectUuid,
                    RequestMethod.CLI,
                );
            case 'compile':
                return f.service.compileProject(
                    f.user,
                    f.projectUuid,
                    RequestMethod.CLI,
                    'fixture-job',
                );
            case 'deploy':
                return f.service.saveDeployExplores({
                    ...args,
                    cliDeploy: NO_CLI_DEPLOY_SELECTION,
                });
            case 'retained':
                return f.service['saveExploresKeepingExtraConnections'](args);
            case 'array':
                return f.service.saveExploresToCacheAndIndexCatalog(args);
            case 'start':
                return f.deploy.startDeploySession(f.account, f.projectUuid);
            case 'batch':
                return f.deploy.addDeployBatch(
                    f.user,
                    f.projectUuid,
                    sessionUuid,
                    incoming,
                    1,
                );
            case 'finalize':
                return f.deploy.finalizeDeploy(
                    f.user,
                    f.projectUuid,
                    sessionUuid,
                );
            case 'parameters':
                return f.service.replaceProjectParameters({
                    user: f.user,
                    projectUuid: f.projectUuid,
                    parameters: {
                        region: { type: 'string', default: 'changed' },
                    } as never,
                });
            case 'virtual-create':
                return f.service.createVirtualView(
                    f.account,
                    f.projectUuid,
                    payload,
                    false,
                );
            case 'virtual-update':
                return f.service.updateVirtualView(
                    f.account,
                    f.projectUuid,
                    'guard_view',
                    payload,
                    false,
                );
            case 'stream':
                return f.service['saveExploreStreamToCacheAndIndexCatalog']({
                    ...args,
                    multiConnection: null,
                    exploreStream: (async function* source() {
                        yield* incoming;
                    })(),
                });
            case 'refresh':
                return hooks.refreshTablesAndProjectConfig(
                    f.user,
                    f.projectUuid,
                    RequestMethod.CLI,
                    undefined,
                    async (prepared) => {
                        for await (const item of prepared.exploreStream)
                            expect(item).toBeDefined();
                    },
                );
            default:
                throw new Error(`Unknown operation ${operation}`);
        }
    };
    return { run, sink, sessionUuid };
};

export const refreshSchedulerHooks = (task: SchedulerTask) =>
    task as unknown as {
        compileProject: SchedulerTask['compileProject'];
    };
