import {
    FeatureFlags,
    ForbiddenError,
    QueryHistoryStatus,
    type AiAgent,
    type AiArtifact,
    type SessionUser,
    type SlackPrompt,
} from '@lightdash/common';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { type SlackArtifactRenderInput } from '../../database/entities/aiSlackArtifactDeliveries';
import { getSlackArtifactCardBlockId } from '../ai/utils/slackArtifactImages';
import { AiAgentService } from './AiAgentService';

describe('Slack image delivery scope', () => {
    const setup = () => {
        const prompt = {
            promptUuid: 'prompt',
            agentUuid: 'agent',
            projectUuid: 'project',
            organizationUuid: 'org',
            threadUuid: 'thread',
            createdByUserUuid: 'user',
            response: 'Answer',
            errorMessage: null,
            slackChannelId: 'channel',
            slackThreadTs: '100.0',
            promptSlackTs: '101.0',
            response_slack_ts: '102.0',
        } as SlackPrompt;
        const settings = { aiAgentsEnabled: true, aiLinksOnly: false };
        const replies = vi.fn().mockResolvedValue({ messages: [] });
        const getAsyncQueryHistory = vi.fn().mockResolvedValue({});
        const getRawAsyncQueryResults = vi.fn();
        const updateMessage = vi.fn();
        const getDelivery = vi.fn();
        const executeAsyncMetricQuery = vi.fn();
        const exportAiAgentArtifact = vi.fn().mockResolvedValue({
            imageUrl: 'https://lightdash.test/custom-image',
        });
        const fileStorageClient = { isEnabled: vi.fn().mockReturnValue(true) };
        const decisionFlag = vi.fn().mockResolvedValue({ enabled: true });
        const service = new AiAgentService({
            featureFlagService: { get: decisionFlag },
            lightdashConfig: {
                ...lightdashConfigMock,
                ai: {
                    ...lightdashConfigMock.ai,
                    decisions: {
                        apiKey: 'test',
                        model: 'test',
                        timeoutMs: 100,
                    },
                },
            },
            orgAiCopilotConfigResolver: { getCopilotConfig: async () => ({}) },
            aiAgentModel: {
                findSlackPrompt: async () => prompt,
                getAgent: async () => ({
                    uuid: 'agent',
                    projectUuid: 'project',
                }),
                slackArtifactDeliveries: { get: getDelivery },
                hasAiPromptInterrupt: async () => false,
            },
            slackAuthenticationModel: {
                getInstallationFromOrganizationUuid: async () => settings,
                getRawInstallationFromOrganizationUuid: async () => ({
                    bot: { id: 'our-bot-id', userId: 'our-bot' },
                }),
            },
            userModel: {
                findSessionUserAndOrgByUuid: async () =>
                    ({
                        userUuid: 'user',
                        organizationUuid: 'org',
                        ability: {
                            can: () => true,
                            cannot: () => false,
                            rules: [],
                        },
                        abilityRules: [],
                    }) as unknown as SessionUser,
            },
            slackClient: {
                getWebClient: async () => ({ conversations: { replies } }),
                updateMessage,
            },
            asyncQueryService: {
                getAsyncQueryHistory,
                getRawAsyncQueryResults,
                executeAsyncMetricQuery,
            },
            fileStorageClient,
            unfurlService: { exportAiAgentArtifact },
        } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
        const agent = {
            uuid: 'agent',
            projectUuid: 'project',
            enableDataAccess: true,
            tags: ['allowed'],
        } as AiAgent;
        vi.spyOn(service, 'getAgent').mockResolvedValue(agent);
        vi.spyOn(
            service as unknown as {
                getIsCopilotEnabled: AiAgentService['getIsCopilotEnabled'];
            },
            'getIsCopilotEnabled',
        ).mockResolvedValue(true);
        const getArtifact = vi.spyOn(service, 'getArtifact').mockResolvedValue({
            artifactUuid: 'artifact',
            versionUuid: 'version',
            promptUuid: 'prompt',
            threadUuid: 'thread',
            chartConfig: { source: 'semantic' },
        } as AiArtifact);
        const getExplore = vi
            .spyOn(
                service as unknown as {
                    getExplore: AiAgentService['getExplore'];
                },
                'getExplore',
            )
            .mockResolvedValue({} as never);
        const input = {
            artifactUuid: 'artifact',
            versionUuid: 'version',
            queryUuid: 'execution',
            rowLimit: 1,
            queryTool: { queryConfig: { exploreName: 'orders' } },
        } as SlackArtifactRenderInput;
        return {
            service,
            decisionFlag,
            prompt,
            settings,
            agent,
            replies,
            input,
            getArtifact,
            getExplore,
            getAsyncQueryHistory,
            getRawAsyncQueryResults,
            updateMessage,
            fileStorageClient,
            getDelivery,
            executeAsyncMetricQuery,
            exportAiAgentArtifact,
        };
    };

    afterEach(() => vi.restoreAllMocks());

    it.each([false, 'unavailable'])(
        'cancels deferred images after the master flag is %s',
        async (state) => {
            const {
                service,
                decisionFlag,
                replies,
                exportAiAgentArtifact,
                updateMessage,
            } = setup();
            if (state === false)
                decisionFlag.mockResolvedValue({ enabled: false });
            else
                decisionFlag.mockRejectedValue(
                    new Error('Flag service unavailable'),
                );
            const runtime =
                await service['prepareSlackArtifactImageDelivery']('prompt');
            expect(runtime).toBeNull();
            expect(decisionFlag).toHaveBeenCalledWith({
                user: expect.objectContaining({
                    userUuid: 'user',
                    organizationUuid: 'org',
                }),
                featureFlagId: FeatureFlags.AiAgentFastDecisions,
            });
            expect(replies).not.toHaveBeenCalled();
            expect(exportAiAgentArtifact).not.toHaveBeenCalled();
            expect(updateMessage).not.toHaveBeenCalled();
        },
    );

    it.each([
        'links-only',
        'data-disabled',
        'storage-disabled',
        'no-answer',
        'error',
    ] as const)('does not prepare an image for %s', async (reason) => {
        const { service, settings, agent, prompt, fileStorageClient, replies } =
            setup();
        if (reason === 'links-only') settings.aiLinksOnly = true;
        if (reason === 'data-disabled') agent.enableDataAccess = false;
        if (reason === 'storage-disabled')
            fileStorageClient.isEnabled.mockReturnValue(false);
        if (reason === 'no-answer') prompt.response = null;
        if (reason === 'error') prompt.errorMessage = 'Failed';
        expect(
            await service['prepareSlackArtifactImageDelivery']('prompt'),
        ).toBeNull();
        expect(replies).not.toHaveBeenCalled();
    });

    it('requires current agent and thread/artifact access, then checks the original execution', async () => {
        const {
            service,
            input,
            getArtifact,
            getExplore,
            getAsyncQueryHistory,
            getRawAsyncQueryResults,
        } = setup();
        const runtime =
            await service['prepareSlackArtifactImageDelivery']('prompt');
        await runtime!.authorize(input);
        expect(getArtifact).toHaveBeenCalledWith(
            expect.objectContaining({ userUuid: 'user' }),
            'project',
            'agent',
            'artifact',
            'version',
        );
        expect(getExplore).toHaveBeenCalledWith(
            expect.anything(),
            'project',
            ['allowed'],
            'orders',
        );
        expect(getAsyncQueryHistory).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: 'project',
                queryUuid: 'execution',
            }),
        );
        expect(getRawAsyncQueryResults).not.toHaveBeenCalled();
    });

    it('rejects cross-prompt artifacts and never reads their result rows', async () => {
        const {
            service,
            input,
            getArtifact,
            getAsyncQueryHistory,
            getRawAsyncQueryResults,
        } = setup();
        getArtifact.mockResolvedValue({
            promptUuid: 'other',
            threadUuid: 'thread',
            chartConfig: { source: 'semantic' },
        } as AiArtifact);
        const runtime =
            await service['prepareSlackArtifactImageDelivery']('prompt');
        await expect(runtime!.authorize(input)).rejects.toBeInstanceOf(
            ForbiddenError,
        );
        await expect(runtime!.render(input)).rejects.toBeInstanceOf(
            ForbiddenError,
        );
        expect(getAsyncQueryHistory).not.toHaveBeenCalled();
        expect(getRawAsyncQueryResults).not.toHaveBeenCalled();
    });

    it('requires access to every source of a merged chart', async () => {
        const {
            service,
            input,
            getExplore,
            getAsyncQueryHistory,
            getRawAsyncQueryResults,
        } = setup();
        input.queryTool.mergeConfig = {
            primarySourceId: 'orders',
            additionalSources: [
                { id: 'customers', queryConfig: { exploreName: 'customers' } },
            ],
        } as SlackArtifactRenderInput['queryTool']['mergeConfig'];
        getExplore.mockImplementation(
            async (_user, _project, _tags, exploreName) => {
                if (exploreName === 'customers')
                    throw new ForbiddenError('Access revoked');
                return {} as never;
            },
        );
        const runtime =
            await service['prepareSlackArtifactImageDelivery']('prompt');
        await expect(runtime!.authorize(input)).rejects.toBeInstanceOf(
            ForbiddenError,
        );
        expect(getExplore.mock.calls.map((call) => call[3])).toEqual([
            'orders',
            'customers',
        ]);
        expect(getAsyncQueryHistory).not.toHaveBeenCalled();
        expect(getRawAsyncQueryResults).not.toHaveBeenCalled();
    });

    it('finds only our bot’s exact artifact card, following cursors', async () => {
        const { service, replies } = setup();
        const blocks = [
            {
                type: 'carousel',
                elements: [
                    {
                        type: 'card',
                        block_id: getSlackArtifactCardBlockId('version'),
                    },
                ],
            },
        ];
        replies.mockResolvedValueOnce({
            messages: [{ bot_id: 'another-bot', ts: '103.0', blocks }],
            response_metadata: { next_cursor: 'page-two' },
        });
        replies.mockResolvedValueOnce({
            messages: [
                {
                    bot_id: 'our-bot-id',
                    ts: '104.0',
                    text: 'Actual answer',
                    blocks,
                },
            ],
        });
        const runtime =
            await service['prepareSlackArtifactImageDelivery']('prompt');
        expect(await runtime!.findMessage(null, ['version'])).toEqual({
            ts: '104.0',
            text: 'Actual answer',
            blocks,
        });
        expect(replies.mock.calls[1][0]).toMatchObject({
            channel: 'channel',
            ts: '100.0',
            oldest: '102.0',
            cursor: 'page-two',
        });
    });

    it('reads the bound execution with its original row count and skips incomplete results', async () => {
        const { service, input, getRawAsyncQueryResults } = setup();
        getRawAsyncQueryResults.mockResolvedValue({ rows: [], fields: {} });
        const runtime =
            await service['prepareSlackArtifactImageDelivery']('prompt');
        await runtime!.authorize(input);
        expect(await runtime!.render(input)).toBeNull();
        expect(getRawAsyncQueryResults).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                projectUuid: 'project',
                queryUuid: 'execution',
                maxRows: 1,
            }),
        );
    });

    const cachedOptions = {
        projectUuid: 'project',
        agentUuid: 'agent',
        artifactUuid: 'artifact',
        versionUuid: 'version',
        cachedQueryUuid: 'execution',
    };
    const cachedUser = {
        userUuid: 'user',
        organizationUuid: 'org',
        ability: { can: () => true, cannot: () => false, rules: [] },
        abilityRules: [],
    } as unknown as SessionUser;
    const cachedSetup = () => {
        const state = setup();
        const artifact = {
            artifactUuid: 'artifact',
            versionUuid: 'version',
            promptUuid: 'prompt',
            threadUuid: 'thread',
            title: 'Original title',
            description: 'Original description',
            chartConfig: { source: 'customChartType' },
        } as AiArtifact;
        state.getArtifact.mockResolvedValue(artifact);
        const delivery = {
            finished_at: null as Date | null,
            render_inputs: { version: state.input },
        };
        state.getDelivery.mockResolvedValue(delivery);
        const history = {
            queryUuid: 'execution',
            status: QueryHistoryStatus.READY,
            resultsFileName: 'original.jsonl',
            totalRowCount: 1,
            resultsExpiresAt: new Date(Date.now() + 60_000),
            metricQuery: { exploreName: 'orders', timezone: 'Europe/London' },
            fields: {},
            usedParameters: { currency: 'GBP' },
        };
        state.getAsyncQueryHistory.mockResolvedValue(history);
        return { ...state, artifact, delivery, history };
    };

    it('renders custom charts from the bound cache with an abort signal', async () => {
        const {
            service,
            input,
            artifact,
            exportAiAgentArtifact,
            getRawAsyncQueryResults,
        } = cachedSetup();
        const { signal } = new AbortController();
        const runtime = await service['prepareSlackArtifactImageDelivery'](
            'prompt',
            signal,
        );
        await runtime!.authorize(input);
        expect(await runtime!.render(input)).toBe(
            'https://lightdash.test/custom-image',
        );
        expect(exportAiAgentArtifact).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ userUuid: 'user' }),
            {
                projectUuid: 'project',
                agentUuid: 'agent',
                artifact,
                cachedQueryUuid: 'execution',
                signal,
            },
        );
        expect(getRawAsyncQueryResults).not.toHaveBeenCalled();
    });

    it('serves the original custom execution metadata without starting another query', async () => {
        const { service, executeAsyncMetricQuery, history } = cachedSetup();
        const result = await service.getArtifactVizQuery(
            cachedUser,
            cachedOptions,
        );
        expect(result).toMatchObject({
            metadata: {
                title: 'Original title',
                description: 'Original description',
            },
            query: {
                queryUuid: 'execution',
                metricQuery: history.metricQuery,
                fields: {},
                usedParametersValues: { currency: 'GBP' },
                resolvedTimezone: 'Europe/London',
            },
        });
        expect(executeAsyncMetricQuery).not.toHaveBeenCalled();
    });

    it.each([
        'different-query',
        'different-artifact',
        'different-user',
        'finished',
        'links-only',
        'expired',
        'wrong-row-count',
        'missing-file',
        'not-ready',
    ])('never reruns or substitutes cached data for %s', async (reason) => {
        const {
            service,
            input,
            prompt,
            delivery,
            settings,
            history,
            executeAsyncMetricQuery,
        } = cachedSetup();
        if (reason === 'different-query') input.queryUuid = 'other';
        if (reason === 'different-artifact') input.artifactUuid = 'other';
        if (reason === 'different-user') prompt.createdByUserUuid = 'other';
        if (reason === 'finished') delivery.finished_at = new Date();
        if (reason === 'links-only') settings.aiLinksOnly = true;
        if (reason === 'expired') history.resultsExpiresAt = new Date(0);
        if (reason === 'wrong-row-count') history.totalRowCount = 2;
        if (reason === 'missing-file') history.resultsFileName = '';
        if (reason === 'not-ready') history.status = QueryHistoryStatus.ERROR;
        await expect(
            service.getArtifactVizQuery(cachedUser, cachedOptions),
        ).rejects.toThrow();
        expect(executeAsyncMetricQuery).not.toHaveBeenCalled();
    });

    it('reads a persisted message timestamp exactly and updates that same message', async () => {
        const { service, replies, updateMessage } = setup();
        const message = {
            user: 'our-bot',
            ts: '104.0',
            text: 'Answer',
            blocks: [
                {
                    type: 'card',
                    block_id: getSlackArtifactCardBlockId('version'),
                },
            ],
        };
        replies.mockResolvedValue({ messages: [message] });
        const runtime =
            await service['prepareSlackArtifactImageDelivery']('prompt');
        const found = await runtime!.findMessage('104.0', ['version']);
        expect(replies).toHaveBeenCalledWith(
            expect.objectContaining({
                oldest: '104.0',
                latest: '104.0',
                inclusive: true,
            }),
        );
        await runtime!.updateMessage(found!);
        expect(updateMessage).toHaveBeenCalledWith({
            organizationUuid: 'org',
            channelId: 'channel',
            messageTs: '104.0',
            text: 'Answer',
            blocks: message.blocks,
        });
    });
});
