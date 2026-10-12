import {
    AgentCapability,
    ForbiddenError,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { getRequiredAgentCapabilities } from '../auth/agentPermissions/capabilityMap';
import { agentExecutionContext } from '../services/AiAccessService/agentExecutionContext';
import { ProjectService } from '../services/ProjectService/ProjectService';
import { AgentConnectionApprovalReadModel } from './AgentConnectionApprovalReadModel';

it.each([
    {
        name: 'no pre-aggregates',
        stored: false,
        cron: null,
        definitions: null,
        scheduled: false,
    },
    {
        name: 'stored cron',
        stored: true,
        cron: '0 * * * *',
        definitions: null,
        scheduled: true,
    },
    {
        name: 'cached cron',
        stored: false,
        cron: null,
        definitions: [{ refresh: { cron: '0 * * * *' } }],
        scheduled: true,
    },
    {
        name: 'definitions without cron',
        stored: true,
        cron: null,
        definitions: [{}, { refresh: {} }, { refresh: { cron: null } }],
        scheduled: false,
    },
    {
        name: 'non-null empty cron',
        stored: true,
        cron: '',
        definitions: null,
        scheduled: true,
    },
])(
    'mirrors actual ProjectService scheduled-refresh enforcement: $name',
    async ({ cron, definitions, scheduled, stored }) => {
        const database = knex({ client: MockClient, dialect: 'pg' });
        const tracker = getTracker();
        tracker.on
            .select('pre_aggregate_definitions')
            .response(cron === null ? [] : [{ project_uuid: 'project' }]);
        tracker.on
            .select('cached_explore')
            .response(
                definitions === null
                    ? []
                    : [{ project_uuid: 'project', definitions }],
            );
        const model = new AgentConnectionApprovalReadModel({ database });
        const context = vi
            .spyOn(agentExecutionContext, 'getStore')
            .mockReturnValue({ agentConnectionExecution: {} } as never);
        try {
            const result = await model.getScheduledRefreshProjectUuids([
                'project',
            ]);
            const receiver = {
                preAggregateModel: {
                    getPreAggregateDefinitionsForProject: async () =>
                        stored ? [{ refreshCron: cron }] : [],
                },
                projectModel: {
                    getAllExploresFromCache: async () =>
                        definitions === null
                            ? {}
                            : {
                                  explore: {
                                      preAggregates: definitions,
                                  } as unknown as Explore | ExploreError,
                              },
                },
            } as unknown as ProjectService;
            const actual =
                ProjectService.prototype.assertConnectionPreAggregateRefresh.call(
                    receiver,
                    'project',
                );
            if (scheduled)
                await expect(actual).rejects.toBeInstanceOf(ForbiddenError);
            else await expect(actual).resolves.toBeUndefined();
            expect(result).toEqual(scheduled ? ['project'] : []);
            expect(tracker.history.select).toHaveLength(2);
            expect(
                tracker.history.select.find((query) =>
                    query.sql.includes('pre_aggregate_definitions'),
                )?.sql,
            ).toContain('"refresh_cron" is not null');
        } finally {
            context.mockRestore();
            tracker.reset();
            await database.destroy();
        }
    },
);

it('pins the capabilities required by deploy, refresh and parameter changes', () => {
    expect(
        getRequiredAgentCapabilities(
            'rest',
            'ParametersController.replaceParameters',
        ),
    ).toEqual([AgentCapability.Administration]);
    for (const key of [
        'ExploreController.SetExplores',
        'DeployController.deployExplores',
        'DeployController.startDeploySession',
        'DeployController.addDeployBatch',
        'DeployController.finalizeDeploySession',
        'ProjectController.refresh',
    ]) {
        expect(getRequiredAgentCapabilities('rest', key)).toContain(
            AgentCapability.DeployUpload,
        );
    }
});
