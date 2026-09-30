import { toolRunQueryArgsSchemaTransformed } from '@lightdash/common';
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
        chartConfig: {
            defaultVizType: 'bar',
            xAxisDimension: 'orders_month',
            yAxisMetrics: ['orders_revenue'],
            groupBy: null,
            xAxisType: 'category',
            stackBars: false,
            lineType: null,
            xAxisLabel: 'Month',
            yAxisLabel: 'Revenue',
            secondaryYAxisMetric: null,
            secondaryYAxisLabel: null,
        },
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

        expect(harness.runtime.authorize).toHaveBeenCalledWith(
            harness.selected,
        );
        expect(harness.runtime.authorize).not.toHaveBeenCalledWith(
            harness.diagnostic,
        );
        expect(harness.runtime.render).toHaveBeenCalledExactlyOnceWith(
            harness.selected,
        );
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
    });

    it('cancels a known answer with no registered cards without rendering', async () => {
        const harness = setup([{ type: 'section', block_id: 'answer' }]);

        await deliverSlackArtifactImages(harness);

        expect(harness.runtime.authorize).not.toHaveBeenCalled();
        expect(harness.runtime.render).not.toHaveBeenCalled();
        expect(harness.model.finish).toHaveBeenCalledExactlyOnceWith(
            harness.promptUuid,
            'cancelled',
            1,
        );
    });
});
