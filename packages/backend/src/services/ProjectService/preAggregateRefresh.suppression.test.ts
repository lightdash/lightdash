import {
    agentExecutionContext,
    type AgentExecutionContext,
} from '../AiAccessService/agentExecutionContext';
import { ProjectService } from './ProjectService';

vi.mock('../../utils/agentConnectionExecution', async (importOriginal) => ({
    ...(await importOriginal<
        typeof import('../../utils/agentConnectionExecution')
    >()),
    captureAgentConnectionTask: vi.fn().mockReturnValue({}),
}));
vi.mock('../../config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('../../config/lightdashConfig.mock');
    return { lightdashConfig: lightdashConfigMock };
});

test.each([
    { context: 'HTTP connection', execution: true, claim: true },
    { context: 'scheduler connection', execution: true, claim: true },
    { context: 'ordinary', execution: false, claim: false },
    { context: 'execution only', execution: true, claim: false },
    { context: 'claim only', execution: false, claim: true },
])('$context suppresses cron for either key', async ({ execution, claim }) => {
    const schedule = vi.fn();
    const service: ProjectService = Object.assign(
        Object.create(ProjectService.prototype),
        {
            assertAgentConnectionEffect: vi.fn().mockResolvedValue(undefined),
            syncPreAggregateDefinitionsRegistry: vi.fn(),
            preAggregateModel: {
                getPreAggregateDefinitionsForProject: async () => [
                    {
                        preAggregateDefinitionUuid: 'definition',
                        materializationMetricQuery: {},
                        refreshCron: '',
                    },
                ],
            },
            schedulerClient: {
                materializePreAggregate: vi.fn(),
                schedulePreAggregateCronJobs: schedule,
            },
            projectModel: { get: async () => ({ schedulerTimezone: 'UTC' }) },
            logger: { error: vi.fn() },
        },
    );
    const scope = {
        agentConnectionExecution: execution ? {} : null,
        claim: claim ? { act: { agent_connection_grant: {} } } : null,
    } as AgentExecutionContext;
    await agentExecutionContext.run(scope, () =>
        service['syncAndEnqueuePreAggregateMaterializations']({
            projectUuid: 'project',
            userUuid: 'user',
            organizationUuid: 'org',
            skipMaterialization: false,
        }),
    );
    expect(schedule).toHaveBeenCalledTimes(execution || claim ? 0 : 1);
});
