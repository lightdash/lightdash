import {
    AiAccessRefusalReason,
    AiAccessRefusedError,
    toolRunQueryArgsSchemaTransformed,
} from '@lightdash/common';
import { type ParsedAgentWorkMarker } from '../../../services/AgentPermissionService/agentWorkAuthority';
import {
    type DbAiSlackArtifactDelivery,
    type SlackArtifactRenderInput,
} from '../../database/entities/aiSlackArtifactDeliveries';
import { type AiSlackArtifactDeliveryModel } from '../../models/AiSlackArtifactDeliveryModel';
import { getSlackArtifactCardBlockId } from '../ai/utils/slackArtifactImages';
import {
    deliverSlackArtifactImages,
    type SlackArtifactDeliveryMessage,
    type SlackArtifactDeliveryRuntime,
} from './SlackArtifactImageDelivery';

const renderInput = (versionUuid: string): SlackArtifactRenderInput => ({
    artifactUuid: 'artifact',
    versionUuid,
    queryUuid: `query-${versionUuid}`,
    rowLimit: 1,
    queryTool: toolRunQueryArgsSchemaTransformed.parse({
        title: 'Revenue',
        description: 'Revenue by month',
        queryConfig: {
            exploreName: 'orders',
            dimensions: ['orders_month'],
            metrics: ['orders_revenue'],
            sorts: [],
            limit: 1,
            parameters: null,
            filters: null,
            customMetrics: null,
            tableCalculations: null,
        },
        chartConfig: null,
        mergeConfig: null,
    }),
});

const setup = (blocks: SlackArtifactDeliveryMessage['blocks']) => {
    const selected = renderInput('selected');
    const diagnostic = renderInput('diagnostic');
    const promptUuid = 'prompt';
    let delivery: DbAiSlackArtifactDelivery = {
        ai_prompt_uuid: promptUuid,
        render_inputs: { selected, diagnostic },
        rendered_images: {},
        message_ts: null,
        attempts: 1,
        outcome: null,
        finished_at: null,
        created_at: new Date(),
        updated_at: new Date(),
    };
    const model = {
        claim: vi
            .fn<AiSlackArtifactDeliveryModel['claim']>()
            .mockImplementation(async () => ({ ...delivery })),
        get: vi
            .fn<AiSlackArtifactDeliveryModel['get']>()
            .mockImplementation(async () => delivery),
        setMessage: vi
            .fn<AiSlackArtifactDeliveryModel['setMessage']>()
            .mockImplementation(async (_promptUuid, messageTs) => {
                delivery = { ...delivery, message_ts: messageTs };
            }),
        saveImage: vi
            .fn<AiSlackArtifactDeliveryModel['saveImage']>()
            .mockImplementation(async (_promptUuid, versionUuid, url) => {
                delivery = {
                    ...delivery,
                    rendered_images: {
                        ...delivery.rendered_images,
                        [versionUuid]: url,
                    },
                };
            }),
        finish: vi
            .fn<AiSlackArtifactDeliveryModel['finish']>()
            .mockResolvedValue(undefined),
    };
    let message: SlackArtifactDeliveryMessage = {
        ts: '123.456',
        text: 'Answer',
        blocks,
    };
    const runtime = {
        findMessage: vi
            .fn<SlackArtifactDeliveryRuntime['findMessage']>()
            .mockImplementation(async () => message),
        authorize: vi
            .fn<SlackArtifactDeliveryRuntime['authorize']>()
            .mockResolvedValue(undefined),
        render: vi
            .fn<SlackArtifactDeliveryRuntime['render']>()
            .mockResolvedValue('https://lightdash.test/image/selected'),
        isImageReachable: vi
            .fn<SlackArtifactDeliveryRuntime['isImageReachable']>()
            .mockResolvedValue(true),
        updateMessage: vi
            .fn<SlackArtifactDeliveryRuntime['updateMessage']>()
            .mockImplementation(async (next) => {
                message = next;
            }),
    };
    return {
        promptUuid,
        selected,
        diagnostic,
        model,
        runtime,
        prepare: vi.fn().mockResolvedValue(runtime),
        current: () => message,
    };
};

describe('Slack artifact image selection', () => {
    it('renders only final carousel cards and preserves native tables and feedback', async () => {
        const table = {
            type: 'data_table',
            block_id: 'table',
            caption: 'Revenue',
            rows: [
                [{ type: 'raw_text', text: 'Revenue' }],
                [{ type: 'raw_number', value: 1, text: '1' }],
            ],
        };
        const feedback = {
            type: 'context',
            block_id: 'feedback',
            elements: [{ type: 'plain_text', text: 'Rated helpful' }],
        };
        const carousel = {
            type: 'carousel',
            block_id: 'charts',
            elements: [
                {
                    type: 'card',
                    block_id: getSlackArtifactCardBlockId('selected'),
                    title: { type: 'plain_text', text: 'Revenue' },
                },
            ],
        };
        const harness = setup([table, carousel, feedback]);

        await deliverSlackArtifactImages(harness);

        expect(harness.runtime.authorize).toHaveBeenCalledTimes(2);
        expect(harness.runtime.authorize).toHaveBeenCalledWith(
            harness.selected,
        );
        expect(harness.runtime.authorize).not.toHaveBeenCalledWith(
            harness.diagnostic,
        );
        expect(harness.runtime.render).toHaveBeenCalledExactlyOnceWith(
            harness.selected,
        );
        expect(harness.model.saveImage).toHaveBeenCalledExactlyOnceWith(
            harness.promptUuid,
            'selected',
            'https://lightdash.test/image/selected',
        );
        expect(harness.runtime.updateMessage).toHaveBeenCalledTimes(1);
        expect(harness.current().blocks[0]).toBe(table);
        expect(harness.current().blocks[2]).toBe(feedback);
        expect(harness.current().blocks[1]).toMatchObject({
            block_id: 'charts',
            elements: [
                {
                    block_id: getSlackArtifactCardBlockId('selected'),
                    hero_image: {
                        image_url: 'https://lightdash.test/image/selected',
                    },
                },
            ],
        });
        expect(harness.model.finish).toHaveBeenCalledExactlyOnceWith(
            harness.promptUuid,
            'delivered',
            1,
        );
    });

    it('cancels a known answer with no registered cards without rendering', async () => {
        const harness = setup([{ type: 'section', block_id: 'answer' }]);

        await deliverSlackArtifactImages(harness);

        expect(harness.runtime.authorize).not.toHaveBeenCalled();
        expect(harness.runtime.render).not.toHaveBeenCalled();
        expect(harness.model.saveImage).not.toHaveBeenCalled();
        expect(harness.runtime.updateMessage).not.toHaveBeenCalled();
        expect(harness.model.finish).toHaveBeenCalledExactlyOnceWith(
            harness.promptUuid,
            'cancelled',
            1,
        );
    });
});

describe('Slack image authority refusals', () => {
    it.each(['prepare', 'prepare-throws', 'render', 'update'] as const)(
        'cancels a refusal during %s without retrying',
        async (stage) => {
            const h = setup([
                {
                    type: 'card',
                    block_id: getSlackArtifactCardBlockId('selected'),
                },
            ]);
            const agentWork: ParsedAgentWorkMarker = {
                status: 'valid',
                marker: {
                    userUuid: 'user',
                    organizationUuid: 'org',
                    projectUuid: 'project',
                },
            };
            const refusal = new AiAccessRefusedError(
                AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
            );
            if (stage === 'prepare') h.prepare.mockResolvedValue(null);
            if (stage === 'prepare-throws')
                h.prepare.mockRejectedValue(refusal);
            if (stage === 'render') h.runtime.render.mockRejectedValue(refusal);
            if (stage === 'update')
                h.runtime.updateMessage.mockRejectedValue(refusal);
            await expect(
                deliverSlackArtifactImages(h, agentWork),
            ).resolves.toBeUndefined();
            expect(h.model.finish).toHaveBeenCalledExactlyOnceWith(
                'prompt',
                'cancelled',
                1,
            );
            if (stage !== 'update')
                expect(h.runtime.updateMessage).not.toHaveBeenCalled();
        },
    );
});

describe('Unmarked Slack image refusal parity', () => {
    it.each(['render', 'update'] as const)(
        'keeps the existing retry path for an unmarked %s refusal',
        async (stage) => {
            const h = setup([
                {
                    type: 'card',
                    block_id: getSlackArtifactCardBlockId('selected'),
                },
            ]);
            const refusal = new AiAccessRefusedError(
                AiAccessRefusalReason.AGENT_PROJECT_DENIED,
            );
            if (stage === 'render') h.runtime.render.mockRejectedValue(refusal);
            else h.runtime.updateMessage.mockRejectedValue(refusal);
            if (stage === 'render')
                await expect(deliverSlackArtifactImages(h)).rejects.toEqual(
                    new Error(
                        'Some Slack artifact images are still unavailable',
                    ),
                );
            else
                await expect(deliverSlackArtifactImages(h)).rejects.toBe(
                    refusal,
                );
            expect(h.model.finish).not.toHaveBeenCalled();
        },
    );
});
