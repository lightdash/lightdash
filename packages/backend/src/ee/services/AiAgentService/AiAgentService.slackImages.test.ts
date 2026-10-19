import {
    AgentActorSurface,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    FeatureFlags,
    ForbiddenError,
    QueryHistoryStatus,
    type AiAgent,
    type AiArtifact,
    type SessionUser,
    type SlackPrompt,
} from '@lightdash/common';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { parseAgentWorkMarker } from '../../../services/AgentPermissionService/agentWorkAuthority';
import { type SlackArtifactRenderInput } from '../../database/entities/aiSlackArtifactDeliveries';
import { renderEcharts } from '../ai/utils/renderEcharts';
import { getSlackArtifactCardBlockId } from '../ai/utils/slackArtifactImages';
import { AiAgentService } from './AiAgentService';

vi.mock('@lightdash/common', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@lightdash/common')>()),
    getSlackAiEchartsConfig: vi.fn().mockResolvedValue({}),
}));
vi.mock('../ai/utils/renderEcharts', () => ({
    renderEcharts: vi.fn().mockResolvedValue(Buffer.from('image')),
}));

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
        const fileStorageClient = {
            isEnabled: vi.fn().mockReturnValue(true),
            uploadImage: vi.fn().mockResolvedValue(undefined),
        };
        const previewCreate = vi.fn().mockResolvedValue(undefined);
        const decisionFlag = vi.fn().mockResolvedValue({ enabled: true });
        const loadRequest = vi.fn().mockResolvedValue({});
        const assertOperationWithRequest = vi.fn().mockResolvedValue(undefined);
        const finish = vi.fn().mockResolvedValue(undefined);
        const findPending = vi.fn().mockResolvedValue(['prompt']);
        const slackAiArtifactImages = vi.fn().mockResolvedValue(undefined);
        const service = new AiAgentService({
            agentPermissionService: { loadRequest, assertOperationWithRequest },
            agentActionLogModel: {
                insert: vi.fn().mockResolvedValue(undefined),
            },
            schedulerClient: { slackAiArtifactImages },
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
            orgAiCopilotConfigResolver: {
                getCopilotConfig: async () => ({}),
                isOrgBedrockRouted: async () => false,
            },
            aiAgentModel: {
                findSlackPrompt: async () => prompt,
                getAgent: async () => ({
                    uuid: 'agent',
                    projectUuid: 'project',
                }),
                slackArtifactDeliveries: {
                    get: getDelivery,
                    claim: vi.fn().mockResolvedValue({ attempts: 1 }),
                    finish,
                    findPending,
                },
                hasAiPromptInterrupt: async () => false,
            },
            slackAuthenticationModel: {
                getInstallationFromOrganizationUuid: async () => settings,
                getRawInstallationFromOrganizationUuid: async () => ({
                    appId: 'installed-app',
                    bot: { id: 'our-bot-id', userId: 'our-bot' },
                }),
            },
            userModel: {
                findServiceAccountByUserUuid: vi
                    .fn()
                    .mockResolvedValue(undefined),
                findSessionUserAndOrgByUuid: vi.fn(
                    async () =>
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
                ),
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
            slackUnfurlImageModel: { create: previewCreate },
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
            loadRequest,
            assertOperationWithRequest,
            finish,
            findPending,
            slackAiArtifactImages,
            previewCreate,
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

    it('preserves main preparation calls without an agent work marker', async () => {
        const h = setup();
        const userLoad = h.service['userModel'].findSessionUserAndOrgByUuid;
        const runtime =
            await h.service['prepareSlackArtifactImageDelivery']('prompt');
        expect(runtime).not.toBeNull();
        expect(userLoad).toHaveBeenCalledExactlyOnceWith('user', 'org');
        // Slack chart images are delivered on every instance, including those
        // without a decisions provider.
        expect(h.decisionFlag).not.toHaveBeenCalledWith(
            expect.objectContaining({
                featureFlagId: FeatureFlags.AiAgentFastDecisions,
            }),
        );
    });

    const marker = {
        userUuid: 'user',
        organizationUuid: 'org',
        projectUuid: 'project',
    };
    const payload = { ...marker, slackPromptUuid: 'prompt', agentWork: marker };

    it('loads the marked person once when preparing and rechecks before updating Slack', async () => {
        const h = setup();
        const runtime = await h.service['prepareSlackArtifactImageDelivery'](
            'prompt',
            undefined,
            parseAgentWorkMarker(payload),
        );
        expect(runtime).not.toBeNull();
        expect(
            h.service['userModel'].findSessionUserAndOrgByUuid,
        ).toHaveBeenCalledTimes(1);
        expect(h.loadRequest).toHaveBeenCalledTimes(1);
        await runtime!.updateMessage({ ts: 'ts', text: 'Answer', blocks: [] });
        expect(h.loadRequest).toHaveBeenCalledTimes(2);
        expect(h.updateMessage).toHaveBeenCalledTimes(1);
    });

    it.each(['inactive', 'malformed'] as const)(
        'cancels a marked image job at admission: %s',
        async (reason) => {
            const h = setup();
            if (reason === 'inactive')
                vi.mocked(
                    h.service['userModel'].findSessionUserAndOrgByUuid,
                ).mockResolvedValue({
                    ...defaultSessionUser,
                    userUuid: 'user',
                    organizationUuid: 'org',
                    isActive: false,
                } as SessionUser);
            const job = {
                ...payload,
                ...(reason === 'malformed'
                    ? { agentWork: {} as typeof marker }
                    : {}),
            };
            expect(
                await h.service['prepareSlackArtifactImageDelivery'](
                    'prompt',
                    undefined,
                    parseAgentWorkMarker(job),
                ),
            ).toBeNull();
            await h.service.deliverSlackArtifactImages(job);
            expect(h.finish).toHaveBeenCalledExactlyOnceWith(
                'prompt',
                'cancelled',
                1,
            );
            expect(h.updateMessage).not.toHaveBeenCalled();
            expect(h.exportAiAgentArtifact).not.toHaveBeenCalled();
        },
    );

    it('refuses an image update after policy changes', async () => {
        const h = setup();
        const runtime = await h.service['prepareSlackArtifactImageDelivery'](
            'prompt',
            undefined,
            parseAgentWorkMarker(payload),
        );
        h.assertOperationWithRequest.mockRejectedValue(
            new AiAccessRefusedError(
                AiAccessRefusalReason.AGENT_PROJECT_DENIED,
            ),
        );
        await expect(
            runtime!.updateMessage({ ts: 'ts', text: 'Answer', blocks: [] }),
        ).rejects.toBeInstanceOf(AiAccessRefusedError);
        expect(h.updateMessage).not.toHaveBeenCalled();
    });

    it.each([true, false])(
        'the repair sweep reads one identity flag per pending prompt: %s',
        async (enabled) => {
            const h = setup();
            h.findPending.mockResolvedValue(['prompt', 'prompt-2']);
            h.decisionFlag.mockResolvedValue({ enabled });
            const otherMarker = {
                userUuid: 'other-user',
                organizationUuid: 'other-org',
                projectUuid: 'other-project',
            };
            vi.spyOn(h.service['aiAgentModel'], 'findSlackPrompt')
                .mockResolvedValueOnce(h.prompt)
                .mockResolvedValueOnce({
                    ...h.prompt,
                    promptUuid: 'prompt-2',
                    createdByUserUuid: otherMarker.userUuid,
                    organizationUuid: otherMarker.organizationUuid,
                    projectUuid: otherMarker.projectUuid,
                });
            await h.service.sweepSlackArtifactImages();
            expect(h.slackAiArtifactImages).toHaveBeenCalledTimes(2);
            expect(h.slackAiArtifactImages).toHaveBeenCalledWith({
                ...otherMarker,
                slackPromptUuid: 'prompt-2',
                ...(enabled ? { agentWork: otherMarker } : {}),
            });
            expect(h.decisionFlag).toHaveBeenCalledWith({
                user: {
                    userUuid: otherMarker.userUuid,
                    organizationUuid: otherMarker.organizationUuid,
                },
                featureFlagId: FeatureFlags.AgentIdentity,
            });
            expect(h.decisionFlag).toHaveBeenCalledTimes(2);
            expect(h.decisionFlag).toHaveBeenCalledWith({
                user: { userUuid: 'user', organizationUuid: 'org' },
                featureFlagId: FeatureFlags.AgentIdentity,
            });
            expect(h.slackAiArtifactImages).toHaveBeenCalledWith({
                ...marker,
                slackPromptUuid: 'prompt',
                ...(enabled ? { agentWork: marker } : {}),
            });
            expect(
                h.service['userModel'].findSessionUserAndOrgByUuid,
            ).not.toHaveBeenCalled();
        },
    );

    it('the repair sweep does not read flags without pending deliveries', async () => {
        const h = setup();
        h.findPending.mockResolvedValue([]);
        await h.service.sweepSlackArtifactImages();
        expect(h.decisionFlag).not.toHaveBeenCalled();
    });

    it.each(['allowed', 'before-upload', 'cached-before-update'] as const)(
        'finishes the image job after %s authority checks',
        async (state) => {
            const h = setup();
            const delivery = {
                attempts: 1,
                finished_at: null,
                message_ts: 'ts',
                render_inputs: { version: h.input },
                rendered_images: (state === 'cached-before-update'
                    ? { version: 'https://lightdash.test/cached' }
                    : {}) as Record<string, string>,
            };
            h.service['aiAgentModel'].slackArtifactDeliveries.claim = vi
                .fn()
                .mockResolvedValue(delivery);
            h.service['aiAgentModel'].slackArtifactDeliveries.setMessage = vi
                .fn()
                .mockResolvedValue(undefined);
            h.service['aiAgentModel'].slackArtifactDeliveries.saveImage = vi
                .fn()
                .mockImplementation(async (_prompt, version, url) => {
                    delivery.rendered_images[version] = url;
                });
            h.getDelivery.mockResolvedValue(delivery);
            h.replies.mockResolvedValue({
                messages: [
                    {
                        user: 'our-bot',
                        ts: 'ts',
                        text: 'Answer',
                        blocks: [
                            {
                                type: 'card',
                                block_id:
                                    getSlackArtifactCardBlockId('version'),
                                title: { type: 'plain_text', text: 'Chart' },
                            },
                        ],
                    },
                ],
            });
            h.getRawAsyncQueryResults.mockResolvedValue({
                rows: [{}],
                fields: {},
            });
            vi.spyOn(
                AiAgentService as unknown as {
                    isCardImageUrlReachable: () => Promise<boolean>;
                },
                'isCardImageUrlReachable',
            ).mockResolvedValue(true);
            const refusal = new AiAccessRefusedError(
                AiAccessRefusalReason.AGENT_PROJECT_DENIED,
            );
            if (state === 'before-upload')
                h.getRawAsyncQueryResults.mockImplementation(async () => {
                    h.assertOperationWithRequest.mockRejectedValue(refusal);
                    return { rows: [{}], fields: {} };
                });
            if (state === 'cached-before-update')
                vi.mocked(
                    AiAgentService['isCardImageUrlReachable'],
                ).mockImplementation(async () => {
                    h.assertOperationWithRequest.mockRejectedValue(refusal);
                    return true;
                });
            const prepare = vi.spyOn(
                h.service as unknown as {
                    prepareSlackArtifactImageDelivery: AiAgentService['prepareSlackArtifactImageDelivery'];
                },
                'prepareSlackArtifactImageDelivery',
            );
            await h.service.deliverSlackArtifactImages(payload);
            if (state === 'allowed') {
                expect(h.loadRequest).toHaveBeenCalledTimes(4);
                expect(prepare).toHaveBeenCalledTimes(2);
                expect(prepare.mock.calls[0][3]).toBeDefined();
                expect(prepare.mock.calls[1][3]).toBe(prepare.mock.calls[0][3]);
            }
            if (state === 'cached-before-update') {
                expect(h.getRawAsyncQueryResults).not.toHaveBeenCalled();
                expect(
                    h.service['aiAgentModel'].slackArtifactDeliveries.saveImage,
                ).not.toHaveBeenCalled();
            }
            expect(h.fileStorageClient.uploadImage).toHaveBeenCalledTimes(
                state === 'allowed' ? 1 : 0,
            );
            expect(h.previewCreate).toHaveBeenCalledTimes(
                state === 'allowed' ? 1 : 0,
            );
            expect(h.updateMessage).toHaveBeenCalledTimes(
                state === 'allowed' ? 1 : 0,
            );
            expect(h.finish).toHaveBeenCalledExactlyOnceWith(
                'prompt',
                state === 'allowed' ? 'delivered' : 'cancelled',
                1,
            );
            expect(
                h.service['userModel'].findSessionUserAndOrgByUuid,
            ).toHaveBeenCalledTimes(
                { allowed: 4, 'before-upload': 2, 'cached-before-update': 3 }[
                    state
                ],
            );
        },
    );

    it.each(['error', 'refusal', 'render-marked', 'render-unmarked'] as const)(
        'withholds cached images on upload check failure but retries render failures: %s',
        async (kind) => {
            const h = setup();
            const cached = { ...h.input, versionUuid: 'cached' };
            const delivery = {
                attempts: 1,
                finished_at: null,
                message_ts: 'ts',
                render_inputs: { cached, version: h.input },
                rendered_images: { cached: 'https://lightdash.test/cached' },
            };
            const model = h.service['aiAgentModel'].slackArtifactDeliveries;
            model.claim = vi.fn().mockResolvedValue(delivery);
            model.setMessage = vi.fn().mockResolvedValue(undefined);
            model.saveImage = vi.fn().mockResolvedValue(undefined);
            h.getDelivery.mockResolvedValue(delivery);
            h.replies.mockResolvedValue({
                messages: [
                    {
                        user: 'our-bot',
                        ts: 'ts',
                        text: 'Answer',
                        blocks: ['cached', 'version'].map((version) => ({
                            type: 'card',
                            block_id: getSlackArtifactCardBlockId(version),
                        })),
                    },
                ],
            });
            h.getRawAsyncQueryResults.mockResolvedValue({
                rows: [{}],
                fields: {},
            });
            vi.spyOn(
                AiAgentService as unknown as {
                    isCardImageUrlReachable: () => Promise<boolean>;
                },
                'isCardImageUrlReachable',
            ).mockResolvedValue(true);
            const error =
                kind === 'refusal'
                    ? new AiAccessRefusedError(
                          AiAccessRefusalReason.AGENT_PROJECT_DENIED,
                      )
                    : new Error('Database unavailable');
            const checkFailure = kind === 'error' || kind === 'refusal';
            if (checkFailure)
                h.loadRequest
                    .mockResolvedValueOnce({})
                    .mockRejectedValueOnce(error);
            else vi.mocked(renderEcharts).mockRejectedValueOnce(error);
            const job = h.service.deliverSlackArtifactImages(
                kind === 'render-unmarked'
                    ? { ...marker, slackPromptUuid: 'prompt' }
                    : payload,
            );
            if (kind === 'refusal') await expect(job).resolves.toBeUndefined();
            else if (checkFailure) await expect(job).rejects.toBe(error);
            else
                await expect(job).rejects.toThrow(
                    'Some Slack artifact images are still unavailable',
                );
            expect(h.fileStorageClient.uploadImage).not.toHaveBeenCalled();
            expect(h.previewCreate).not.toHaveBeenCalled();
            expect(model.saveImage).not.toHaveBeenCalled();
            expect(h.updateMessage).toHaveBeenCalledTimes(checkFailure ? 0 : 1);
            if (kind === 'refusal')
                expect(h.finish).toHaveBeenCalledExactlyOnceWith(
                    'prompt',
                    'cancelled',
                    1,
                );
            else expect(h.finish).not.toHaveBeenCalled();
            expect(h.loadRequest).toHaveBeenCalledTimes(
                {
                    error: 2,
                    refusal: 2,
                    'render-marked': 3,
                    'render-unmarked': 0,
                }[kind],
            );
        },
    );

    it.each([false, 'unavailable'])(
        'prepares deferred images when the fast-decisions flag is %s',
        async (state) => {
            const { service, decisionFlag } = setup();
            if (state === false)
                decisionFlag.mockResolvedValue({ enabled: false });
            else
                decisionFlag.mockRejectedValue(
                    new Error('Flag service unavailable'),
                );
            const runtime =
                await service['prepareSlackArtifactImageDelivery']('prompt');
            expect(runtime).not.toBeNull();
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
                reader: {
                    kind: 'agent',
                    authMethod: 'session',
                    claim: expect.objectContaining({
                        act: {
                            sub: 'slack_agent:installed-app',
                            surface: AgentActorSurface.SLACK_AGENT,
                            client_id: 'installed-app',
                            agent_uuid: 'agent',
                        },
                    }),
                },
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
