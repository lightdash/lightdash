import { toSessionUser } from '../../../auth/account/account';
import { buildAccount } from '../../../auth/account/account.mock';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: class {},
}));

type PrivateService = {
    loadChartTurnContext: (args: unknown) => Promise<unknown>;
    getArtifact: (...args: unknown[]) => Promise<unknown>;
};

type VersionKind = 'chart' | 'answer';

const queryConfig = {
    exploreName: 'orders',
    dimensions: ['orders_order_date_month'],
    metrics: ['orders_total_order_amount'],
};

const buildVersion = (kind: VersionKind, versionNumber: number) => ({
    artifactUuid: 'artifact',
    versionUuid: `version-${versionNumber}`,
    versionNumber,
    chartConfig: {
        source: 'semantic',
        config: {
            title: kind,
            queryConfig,
            chartConfig: kind === 'chart' ? { defaultVizType: 'bar' } : null,
        },
    },
});

// Versions are listed oldest first; the last one is the latest.
const setup = (history: VersionKind[]) => {
    const versions = history.map((kind, index) =>
        buildVersion(kind, index + 1),
    );
    const service = new AiAgentService({
        aiAgentModel: {
            findArtifactsByThreadUuid: vi
                .fn()
                .mockResolvedValue([versions[versions.length - 1]]),
            getContextForPromptUuids: vi.fn().mockResolvedValue(new Map()),
            getPreviousArtifactVersion: vi.fn(
                async (_artifactUuid: string, beforeVersionNumber: number) =>
                    versions[beforeVersionNumber - 2] ?? null,
            ),
        },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    const privateService = service as unknown as PrivateService;
    // Stops the context build right after the ambiguity check; reaching it means the shortcut stays eligible.
    const loadArtifact = vi
        .spyOn(privateService, 'getArtifact')
        .mockResolvedValue(null);
    const load = () =>
        privateService.loadChartTurnContext({
            user: toSessionUser(buildAccount()),
            agent: { uuid: 'agent', tags: null },
            prompt: {
                threadUuid: 'thread',
                promptUuid: 'prompt',
                projectUuid: 'project',
                prompt: 'only 2025',
            },
        });
    return { load, loadArtifact };
};

test.each<[string, VersionKind[]]>([
    ['a chart is followed by a data answer', ['chart', 'answer']],
    [
        'a chart is followed by several data answers',
        ['chart', 'answer', 'answer'],
    ],
    [
        'an earlier chart sits behind the answers',
        ['answer', 'chart', 'answer', 'answer'],
    ],
])(
    'the edit shortcut leaves the turn to the agent when %s',
    async (_, history) => {
        const { load, loadArtifact } = setup(history);

        await expect(load()).resolves.toBeNull();
        expect(loadArtifact).not.toHaveBeenCalled();
    },
);

test.each<[string, VersionKind[]]>([
    ['the latest version is a chart', ['chart']],
    ['a chart follows a data answer', ['answer', 'chart']],
    ['the thread only has data answers', ['answer', 'answer']],
])('the edit shortcut stays eligible when %s', async (_, history) => {
    const { load, loadArtifact } = setup(history);

    await load();

    expect(loadArtifact).toHaveBeenCalledWith(
        expect.anything(),
        'project',
        'agent',
        'artifact',
        `version-${history.length}`,
    );
});
