import { type SlackDataVisualizationBlock } from '@lightdash/common';
import { type Block } from '@slack/web-api';
import {
    getSlackArtifactCardBlockId,
    getSlackArtifactCardVersions,
} from './slackArtifactImages';
import {
    getSlackNativeChartBlockId,
    getSlackNativeChartLayout,
    getSlackNativeCharts,
    sendWithSlackNativeChartFallback,
    toSlackImageChartBlocks,
    type SlackChartBlocks,
} from './slackNativeCharts';

const button = (version: string) => ({
    type: 'button',
    url: `https://lightdash.test/${version}`,
    style: 'primary',
    action_id: `actions.view_composer_card_button_click.${version}`,
    text: { type: 'plain_text', text: 'Explore in Lightdash' },
});
const card = (version: string): Block =>
    ({
        type: 'card',
        block_id: getSlackArtifactCardBlockId(version),
        title: { type: 'mrkdwn', text: version },
        actions: [button(version)],
    }) as Block;
const carousel = (...cards: Block[]): Block =>
    ({ type: 'carousel', block_id: 'carousel', elements: cards }) as Block;
const chart = (version: string): SlackDataVisualizationBlock => ({
    type: 'data_visualization',
    block_id: getSlackNativeChartBlockId(version),
    title: version,
    chart: {
        type: 'bar',
        series: [{ name: 'Orders', data: [{ label: 'a', value: 1 }] }],
        axis_config: { categories: ['a'] },
    },
});
const charts = (...versions: string[]) =>
    new Map(versions.map((version) => [version, chart(version)]));
const nativeBlocks = (version: string) => {
    const { style, ...plainButton } = button(version);
    return [
        chart(version),
        {
            type: 'actions',
            block_id: `ai_agent_native_chart_actions_${version}`,
            elements: [plainButton],
        },
    ];
};

const layoutOf = (
    ...args: Parameters<typeof getSlackNativeChartLayout>
): SlackChartBlocks => {
    const layout = getSlackNativeChartLayout(...args);
    if (!layout) throw new Error('expected native charts');
    return layout;
};

describe('getSlackNativeChartLayout', () => {
    it('replaces a native card with its chart and plain buttons, out of the image job', () => {
        const { native, image } = layoutOf([card('a')], charts('a'));
        expect(native).toEqual(nativeBlocks('a'));
        expect(image).toEqual([card('a')]);
        expect(getSlackArtifactCardVersions(native)).toEqual([]);
    });

    it.each([
        ['keeps a carousel of the image cards', ['a'], ['b', 'c']],
        ['unwraps a single remaining card', ['a', 'b'], ['c']],
        ['drops an empty carousel', ['a', 'b', 'c'], []],
    ])('%s', (_name, nativeVersions, imageVersions) => {
        const { native } = layoutOf(
            [carousel(card('a'), card('b'), card('c'))],
            charts(...nativeVersions),
        );
        const imageCards = imageVersions.map(card);
        expect(native).toEqual([
            ...nativeVersions.flatMap(nativeBlocks),
            ...(imageCards.length > 1 ? [carousel(...imageCards)] : imageCards),
        ]);
        expect(getSlackArtifactCardVersions(native)).toEqual(imageVersions);
    });

    it('returns null without native charts', () => {
        expect(getSlackNativeChartLayout([card('a')], new Map())).toBeNull();
    });
});

describe('toSlackImageChartBlocks', () => {
    it('swaps the native segment of a message for the image cards', () => {
        const layout = layoutOf([carousel(card('a'), card('b'))], charts('a'));
        const before = { type: 'markdown', text: 'answer' } as Block;
        const after = { type: 'context' } as Block;
        expect(
            toSlackImageChartBlocks([before, ...layout.native, after], layout),
        ).toEqual([before, carousel(card('a'), card('b')), after]);
    });
});

describe('getSlackNativeCharts', () => {
    it('stops after two native charts, skipping ineligible ones', async () => {
        const build = vi.fn(async (version: string) =>
            version === 'ineligible'
                ? ({ route: 'image', reason: 'stacked' } as const)
                : ({ route: 'native', block: chart(version) } as const),
        );
        const built = await getSlackNativeCharts(
            ['a', 'ineligible', 'b', 'c'],
            build,
        );
        expect([...built.keys()]).toEqual(['a', 'b']);
        expect(build).toHaveBeenCalledTimes(3);
    });
});

describe('sendWithSlackNativeChartFallback', () => {
    const layout = layoutOf([card('v')], charts('v'));
    const slackError = (code: string) =>
        Object.assign(new Error(code), { data: { ok: false, error: code } });

    it.each([
        'invalid_blocks',
        'invalid_arguments',
        'msg_too_long',
        'msg_blocks_too_long',
    ])(
        'resends with the image card when Slack refuses with %s',
        async (code) => {
            const send = vi
                .fn()
                .mockRejectedValueOnce(slackError(code))
                .mockResolvedValueOnce('sent');
            const onFallback = vi.fn();
            await expect(
                sendWithSlackNativeChartFallback(
                    layout.native,
                    layout,
                    send,
                    onFallback,
                ),
            ).resolves.toBe('sent');
            expect(send).toHaveBeenLastCalledWith([card('v')]);
            expect(onFallback).toHaveBeenCalledOnce();
        },
    );

    it.each([
        ['another Slack error', slackError('ratelimited')],
        ['a network error', new Error('socket hang up')],
    ])('never resends after %s', async (_name, error) => {
        const send = vi.fn().mockRejectedValue(error);
        await expect(
            sendWithSlackNativeChartFallback(
                layout.native,
                layout,
                send,
                vi.fn(),
            ),
        ).rejects.toBe(error);
        expect(send).toHaveBeenCalledOnce();
    });

    it('rethrows a refusal of a message without native charts', async () => {
        const error = slackError('invalid_blocks');
        const send = vi.fn().mockRejectedValue(error);
        await expect(
            sendWithSlackNativeChartFallback(
                [{ type: 'divider' }],
                layout,
                send,
                vi.fn(),
            ),
        ).rejects.toBe(error);
        expect(send).toHaveBeenCalledOnce();
    });
});
