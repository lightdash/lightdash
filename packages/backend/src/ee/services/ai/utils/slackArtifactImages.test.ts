import { type Block } from '@slack/web-api';
import {
    applySlackArtifactImages,
    getSlackArtifactCardBlockId,
    getSlackArtifactCardVersion,
    getSlackArtifactCardVersions,
} from './slackArtifactImages';

const card = (version: string, actions: Record<string, unknown>[] = []) => ({
    type: 'card',
    block_id: getSlackArtifactCardBlockId(version),
    title: { type: 'mrkdwn', text: 'Revenue' },
    body: { type: 'mrkdwn', text: 'Current description' },
    actions,
});
const image = {
    url: 'https://lightdash.test/api/v1/slack/card-image/persisted',
    reachable: true,
};

describe('attributed Slack image updates', () => {
    it('finds and updates cards inside a carousel while preserving its other content', () => {
        const untouched = card('other');
        const blocks = [
            {
                type: 'carousel',
                block_id: 'carousel',
                elements: [untouched, card('v')],
            },
        ];
        expect(getSlackArtifactCardVersions(blocks)).toEqual(['other', 'v']);
        const first = applySlackArtifactImages(blocks, { v: image });
        expect(first.changed).toBe(true);
        expect(first.blocks[0]).toMatchObject({
            block_id: 'carousel',
            elements: [untouched, { hero_image: { image_url: image.url } }],
        });
        const retry = applySlackArtifactImages(first.blocks, { v: image });
        expect(retry.changed).toBe(false);
        expect(retry.blocks).toBe(first.blocks);
    });
    it('updates the exact version among reordered cards with identical titles', () => {
        const blocks = [card('new'), card('old')];
        const result = applySlackArtifactImages(blocks, { old: image });
        expect(result.changed).toBe(true);
        expect(result.blocks[0]).toBe(blocks[0]);
        expect(result.blocks[1]).toMatchObject({
            hero_image: { image_url: image.url },
        });
        expect(blocks[1]).not.toHaveProperty('hero_image');
    });

    it('preserves current feedback, descriptions, links and unrelated message blocks', () => {
        const feedback = {
            type: 'context',
            block_id: 'feedback',
            elements: [{ type: 'mrkdwn', text: 'Rated helpful' }],
        };
        const action = {
            type: 'button',
            action_id: 'open-chart',
            url: 'https://lightdash.test/share/chart',
            text: { type: 'plain_text', text: 'Open chart' },
        };
        const currentCard = card('v', [action]);
        const blocks = [feedback, currentCard];
        const result = applySlackArtifactImages(blocks, { v: image });
        expect(result.blocks[0]).toBe(feedback);
        expect(result.blocks[1]).toMatchObject({
            body: currentCard.body,
            actions: [expect.objectContaining({ url: image.url }), action],
        });
    });

    it('is idempotent across retries and retains the current action identity', () => {
        const blocks = [
            card('v', [
                {
                    type: 'button',
                    action_id: 'actions.open_chart_image_button_click.4',
                    url: 'https://old-image.test',
                },
            ]),
        ];
        const first = applySlackArtifactImages(blocks, { v: image });
        expect(first.blocks[0]).toMatchObject({
            actions: [
                {
                    action_id: 'actions.open_chart_image_button_click.4',
                    url: image.url,
                },
            ],
        });
        const retry = applySlackArtifactImages(first.blocks, { v: image });
        expect(retry.changed).toBe(false);
        expect(retry.blocks).toBe(first.blocks);
    });

    it('keeps all three existing actions rather than dropping a later edit', () => {
        const actions = [
            { action_id: 'a' },
            { action_id: 'b' },
            { action_id: 'c' },
        ];
        expect(
            applySlackArtifactImages([card('v', actions)], { v: image })
                .blocks[0],
        ).toMatchObject({ actions, hero_image: { image_url: image.url } });
    });

    it('offers a link without an unreachable hero image', () => {
        const result = applySlackArtifactImages([card('v')], {
            v: { ...image, reachable: false },
        });
        expect(result.blocks[0]).not.toHaveProperty('hero_image');
        expect(result.blocks[0]).toMatchObject({
            actions: [expect.objectContaining({ url: image.url })],
        });
    });

    // eslint-disable-next-line no-script-url
    it.each(['javascript:alert(1)', 'file:///private/chart.png', 'invalid'])(
        'ignores an invalid image URL: %s',
        (url) => {
            const blocks = [card('v')];
            expect(
                applySlackArtifactImages(blocks, {
                    v: { url, reachable: true },
                }),
            ).toEqual({ blocks, changed: false });
        },
    );

    it('does not use a title, legacy ordinal or an unrelated block ID as attribution', () => {
        const blocks: Block[] = [
            card('v'),
            { type: 'section', block_id: 'ai_agent_chart_card_v' },
            { type: 'card', block_id: 'ai_agent_sql_card_v' },
        ];
        expect(
            applySlackArtifactImages(blocks, { Revenue: image, '0': image }),
        ).toEqual({ blocks, changed: false });
        expect(getSlackArtifactCardVersion(blocks[0])).toBe('v');
        expect(getSlackArtifactCardVersion(blocks[1])).toBeNull();
        expect(getSlackArtifactCardVersion(blocks[2])).toBeNull();
    });
});
