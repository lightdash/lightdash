import { type SessionUser } from '@lightdash/common';
import { validExplore } from '../../../services/ProjectService/ProjectService.mock';
import { type AiAgentDependencies } from '../ai/types/aiAgent';
import { AiAgentService } from './AiAgentService';

type EmbedAiAgentRuntimeOptions = Parameters<
    AiAgentService['getArtifactVizQuery']
>[1]['runtimeOptions'];

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

const user = {
    userUuid: 'user',
    organizationUuid: 'org',
    userId: 1,
    ability: {
        can: () => true,
        cannot: () => false,
        relevantRuleFor: () => ({ inverted: false }),
        rules: [],
    },
    abilityRules: [],
} as unknown as SessionUser;
type ExportFactory = {
    createChartExportArtifactAccess: (scope: {
        user: SessionUser;
        projectUuid: string;
        agentUuid: string;
        threadUuid: string;
        getExplore: AiAgentDependencies['getExplore'];
        runtimeOptions?: EmbedAiAgentRuntimeOptions;
    }) => NonNullable<AiAgentDependencies['chartExportArtifacts']>;
};
const reference = { artifactUuid: 'chart', versionUuid: 'pinned-version' };
const setup = (runtimeOptions?: EmbedAiAgentRuntimeOptions) => {
    const artifact = {
        ...reference,
        threadUuid: 'thread',
        artifactType: 'chart',
        title: 'Stored chart',
        description: 'Stored description',
        chartConfig: {
            source: 'semantic',
            config: {
                title: 'Title',
                description: 'Description',
                chartConfig: null,
                queryConfig: {
                    exploreName: validExplore.name,
                    dimensions: ['a_dim1'],
                    metrics: ['a_met1'],
                    sorts: [],
                    limit: 10,
                    parameters: null,
                    filters: null,
                    customMetrics: null,
                    tableCalculations: null,
                },
            },
        },
    };
    const aiAgentModel = {
        getAgent: vi.fn().mockResolvedValue({
            uuid: 'agent',
            projectUuid: 'project',
            organizationUuid: 'org',
            name: 'Agent',
            spaceAccess: ['space'],
        }),
        getArtifact: vi.fn().mockResolvedValue(artifact),
        findArtifactsByThreadUuid: vi.fn().mockResolvedValue([artifact]),
        findThread: vi.fn().mockResolvedValue({
            organizationUuid: 'org',
            projectUuid: 'project',
            agentUuid: 'agent',
        }),
        getThread: vi.fn().mockResolvedValue({ user: { uuid: 'user' } }),
        getWebAppThreadEmbedSpace: vi.fn().mockResolvedValue('space'),
    };
    const getExplore = vi.fn().mockResolvedValue(validExplore);
    const service = new AiAgentService({
        aiAgentModel,
        lightdashConfig: { ai: { copilot: { maxQueryLimit: 5000 } } },
        featureFlagService: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    const access = (
        service as unknown as ExportFactory
    ).createChartExportArtifactAccess({
        user,
        projectUuid: 'project',
        agentUuid: 'agent',
        threadUuid: 'thread',
        getExplore,
        runtimeOptions,
    });
    return { access, artifact, aiAgentModel, getExplore };
};

describe('artifact export access', () => {
    it('loads the selected version through existing artifact authorization and scoped metadata access', async () => {
        const { access, aiAgentModel, getExplore } = setup();
        expect(await access.prepare(reference)).toMatchObject({
            name: 'Stored chart',
            metricQuery: { limit: 10 },
        });
        expect(aiAgentModel.getArtifact).toHaveBeenCalledWith(
            'chart',
            'pinned-version',
        );
        expect(getExplore).toHaveBeenCalledWith({ table: validExplore.name });
    });

    it.each(['organizationUuid', 'projectUuid', 'agentUuid'] as const)(
        'rejects a different %s before metadata access',
        async (field) => {
            const { access, aiAgentModel, getExplore } = setup();
            aiAgentModel.findThread.mockResolvedValue({
                organizationUuid: 'org',
                projectUuid: 'project',
                agentUuid: 'agent',
                [field]: 'different',
            });
            await expect(access.prepare(reference)).rejects.toThrow(
                'permissions',
            );
            expect(getExplore).not.toHaveBeenCalled();
        },
    );

    it('rejects another conversation even when the user can view its artifact', async () => {
        const { access, artifact, aiAgentModel, getExplore } = setup();
        aiAgentModel.getArtifact.mockResolvedValue({
            ...artifact,
            threadUuid: 'other-thread',
        });
        await expect(access.prepare(reference)).rejects.toThrow(
            'current conversation',
        );
        expect(getExplore).not.toHaveBeenCalled();
    });

    it('rejects missing versions', async () => {
        const { access, aiAgentModel, getExplore } = setup();
        aiAgentModel.getArtifact.mockResolvedValue(null);
        await expect(access.prepare(reference)).rejects.toThrow('not found');
        expect(getExplore).not.toHaveBeenCalled();
    });

    it('rechecks embedded conversation scope before exporting', async () => {
        const { access, getExplore } = setup({
            embedSpaceUuid: 'other-space',
            spaceAccess: ['other-space'],
            userAttributeOverrides: {},
        });
        await expect(access.prepare(reference)).rejects.toThrow();
        await expect(access.list()).rejects.toThrow();
        expect(getExplore).not.toHaveBeenCalled();
    });

    it('lists at most twenty authorized versions, with bounded metadata and no query payloads', async () => {
        const { access, artifact, aiAgentModel, getExplore } = setup();
        aiAgentModel.findArtifactsByThreadUuid.mockResolvedValue(
            Array.from({ length: 25 }, () => artifact),
        );
        aiAgentModel.getArtifact.mockResolvedValue({
            ...artifact,
            title: 'x'.repeat(300),
            description: 'x'.repeat(600),
        });
        const listed = await access.list();
        expect(listed).toHaveLength(20);
        expect(aiAgentModel.findArtifactsByThreadUuid).toHaveBeenCalledWith(
            'thread',
            'chart',
        );
        expect(aiAgentModel.getArtifact).toHaveBeenCalledTimes(20);
        expect(listed[0].title).toHaveLength(255);
        expect(listed[0].description).toHaveLength(500);
        expect(listed[0]).not.toHaveProperty('chartConfig');
        expect(getExplore).not.toHaveBeenCalled();
    });
});
