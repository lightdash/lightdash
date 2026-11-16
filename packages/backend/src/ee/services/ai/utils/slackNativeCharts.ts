import {
    getSlackErrorCode,
    type SlackDataVisualizationBlock,
    type SlackNativeChartRoute,
} from '@lightdash/common';
import { type ActionsBlock, type Block, type KnownBlock } from '@slack/web-api';
import { getSlackArtifactCardVersion } from './slackArtifactImages';

/** Slack rejects a message with more than two data_visualization blocks. */
const SLACK_NATIVE_CHARTS_PER_MESSAGE = 2;

// The installed Slack SDK predates data_visualization, which is a valid Block Kit block.
interface SlackDataVisualizationBlockKit
    extends Block, Omit<SlackDataVisualizationBlock, 'type' | 'block_id'> {
    type: 'data_visualization';
}

type SlackCard = Block & {
    type: 'card';
    actions?: ActionsBlock['elements'];
};

type SlackCarousel = Block & { type: 'carousel'; elements: Block[] };

const isCard = (block: Block | KnownBlock): block is SlackCard =>
    block.type === 'card';

const isCarousel = (block: Block | KnownBlock): block is SlackCarousel =>
    block.type === 'carousel' &&
    'elements' in block &&
    Array.isArray(block.elements);

/** The native chart segment of an answer, and the image cards it replaces. */
export type SlackChartBlocks = {
    native: (Block | KnownBlock)[];
    image: (Block | KnownBlock)[];
};

export const getSlackNativeChartBlockId = (versionUuid: string): string =>
    `ai_agent_native_chart_${versionUuid}`;

/** The chart, then the card's buttons in the default style. */
const getNativeChartBlocks = (
    version: string,
    card: SlackCard,
    chart: SlackDataVisualizationBlock,
): (Block | KnownBlock)[] => {
    const chartBlock: SlackDataVisualizationBlockKit = chart;
    const buttons = (card.actions ?? []).map((element) => {
        if (element.type !== 'button') return element;
        const { style, ...button } = element;
        return button;
    });
    return buttons.length > 0
        ? [
              chartBlock,
              {
                  type: 'actions',
                  block_id: `ai_agent_native_chart_actions_${version}`,
                  elements: buttons,
              },
          ]
        : [chartBlock];
};

/**
 * Native charts replace their cards: each chart is followed by its card's
 * buttons. Remaining image cards keep today's single card or carousel.
 */
export const getSlackNativeChartLayout = (
    cardBlocks: (Block | KnownBlock)[],
    charts: ReadonlyMap<string, SlackDataVisualizationBlock>,
): SlackChartBlocks | null => {
    if (charts.size === 0) return null;
    const isNative = (block: Block) => {
        const version = getSlackArtifactCardVersion(block);
        return version !== null && charts.has(version);
    };
    const cards = cardBlocks.flatMap((block) =>
        isCarousel(block) ? block.elements : [block],
    );
    const nativeBlocks = cards.flatMap((card): (Block | KnownBlock)[] => {
        const version = getSlackArtifactCardVersion(card);
        const chart = version ? charts.get(version) : undefined;
        if (!version || !chart || !isCard(card)) return [];
        return getNativeChartBlocks(version, card, chart);
    });
    const imageCards = cardBlocks.flatMap((block): (Block | KnownBlock)[] => {
        if (!isCarousel(block)) return isNative(block) ? [] : [block];
        const remaining = block.elements.filter((card) => !isNative(card));
        if (remaining.length <= 1) return remaining;
        const carousel: SlackCarousel = { ...block, elements: remaining };
        return [carousel];
    });
    return { native: [...nativeBlocks, ...imageCards], image: cardBlocks };
};

/** A message's blocks with its native chart segment swapped for the image cards. */
export const toSlackImageChartBlocks = (
    blocks: (Block | KnownBlock)[],
    chartBlocks: SlackChartBlocks,
): (Block | KnownBlock)[] => {
    const start = blocks.indexOf(chartBlocks.native[0]);
    if (start === -1) return blocks;
    return [
        ...blocks.slice(0, start),
        ...chartBlocks.image,
        ...blocks.slice(start + chartBlocks.native.length),
    ];
};

// Slack refusals (nothing posted, so a resend cannot duplicate); stopStream
// reports bad charts as invalid_arguments, size limits as msg_too_long.
const SLACK_REJECTION_CODES = [
    'invalid_blocks',
    'invalid_arguments',
    'msg_too_long',
    'msg_blocks_too_long',
];

/** Sends blocks, resending with the image cards when Slack refuses a native chart. */
export const sendWithSlackNativeChartFallback = async <T>(
    blocks: (Block | KnownBlock)[],
    chartBlocks: SlackChartBlocks | null,
    send: (blocks: (Block | KnownBlock)[]) => Promise<T>,
    onFallback: (error: unknown) => void,
): Promise<T> => {
    try {
        return await send(blocks);
    } catch (error) {
        const code = getSlackErrorCode(error);
        const imageBlocks = chartBlocks
            ? toSlackImageChartBlocks(blocks, chartBlocks)
            : blocks;
        if (
            code === undefined ||
            !SLACK_REJECTION_CODES.includes(code) ||
            imageBlocks === blocks
        )
            throw error;
        onFallback(error);
        return send(imageBlocks);
    }
};

/** Builds native charts in card order until the per-message budget is spent. */
export const getSlackNativeCharts = async (
    versions: string[],
    build: (versionUuid: string) => Promise<SlackNativeChartRoute | null>,
): Promise<Map<string, SlackDataVisualizationBlock>> => {
    const charts = new Map<string, SlackDataVisualizationBlock>();
    for (const version of versions) {
        if (charts.size >= SLACK_NATIVE_CHARTS_PER_MESSAGE) break;
        // eslint-disable-next-line no-await-in-loop
        const result = await build(version);
        if (result?.route === 'native') charts.set(version, result.block);
    }
    return charts;
};
