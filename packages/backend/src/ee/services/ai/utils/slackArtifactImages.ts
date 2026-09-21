import { type Block, type KnownBlock } from '@slack/web-api';

const CARD_PREFIX = 'ai_agent_chart_card_';
const IMAGE_ACTION_PREFIX = 'actions.open_chart_image_button_click.';

type ArtifactCard = Block & {
    title?: { text?: string };
    hero_image?: { type: 'image'; image_url: string; alt_text: string };
    actions?: Array<Record<string, unknown>>;
};

export const getSlackArtifactCardBlockId = (versionUuid: string): string =>
    `${CARD_PREFIX}${versionUuid}`;

export const getSlackArtifactCardVersion = (block: {
    type?: string;
    block_id?: string;
}): string | null =>
    block.type === 'card' && block.block_id?.startsWith(CARD_PREFIX)
        ? block.block_id.slice(CARD_PREFIX.length) || null
        : null;

const carouselCards = (block: { type?: string; elements?: unknown }): Block[] =>
    block.type === 'carousel' && Array.isArray(block.elements)
        ? block.elements.filter(
              (element): element is Block =>
                  element !== null &&
                  typeof element === 'object' &&
                  element.type === 'card',
          )
        : [];

export const getSlackArtifactCardVersions = (
    blocks: readonly { type?: string; block_id?: string; elements?: unknown }[],
): string[] =>
    blocks.flatMap((block) => {
        const cards =
            block.type === 'carousel' ? carouselCards(block) : [block];
        return cards.flatMap((card) => {
            const version = getSlackArtifactCardVersion(card);
            return version ? [version] : [];
        });
    });

/** Patch only explicitly attributed cards in the current Slack message. Titles
 * and array positions never identify an image; unrelated blocks/actions survive. */
export const applySlackArtifactImages = (
    blocks: (Block | KnownBlock)[],
    images: Readonly<Record<string, { url: string; reachable: boolean }>>,
): { blocks: (Block | KnownBlock)[]; changed: boolean } => {
    let changed = false;
    const updated = blocks.map((block) => {
        if (
            block.type === 'carousel' &&
            'elements' in block &&
            Array.isArray(block.elements)
        ) {
            const cards = carouselCards(block);
            const result = applySlackArtifactImages(cards, images);
            if (!result.changed) return block;
            changed = true;
            const replacements = new Map(
                cards.map((card, index) => [card, result.blocks[index]]),
            );
            return {
                ...block,
                elements: block.elements.map(
                    (element) => replacements.get(element) ?? element,
                ),
            };
        }
        const version = getSlackArtifactCardVersion(block);
        if (!version || !Object.hasOwn(images, version)) return block;
        const image = images[version];
        try {
            if (!['http:', 'https:'].includes(new URL(image.url).protocol))
                return block;
        } catch {
            return block;
        }
        const card = block as ArtifactCard;
        const actions = card.actions ?? [];
        const existingImageAction = actions.findIndex(
            (action) =>
                typeof action.action_id === 'string' &&
                action.action_id.startsWith(IMAGE_ACTION_PREFIX),
        );
        const imageAction = {
            type: 'button',
            action_id: `${IMAGE_ACTION_PREFIX}${version}`,
            text: { type: 'plain_text', text: 'Open image' },
            url: image.url,
        };
        let nextActions = actions;
        if (existingImageAction >= 0) {
            nextActions = actions.map((action, index) =>
                index === existingImageAction
                    ? { ...action, url: image.url }
                    : action,
            );
        } else if (actions.length < 3) {
            nextActions = [imageAction, ...actions];
        }
        const next: ArtifactCard = {
            ...card,
            ...(image.reachable
                ? {
                      hero_image: {
                          type: 'image' as const,
                          image_url: image.url,
                          alt_text: (
                              card.title?.text || 'Lightdash chart'
                          ).slice(0, 200),
                      },
                  }
                : {}),
            ...(nextActions.length ? { actions: nextActions } : {}),
        };
        if (JSON.stringify(next) === JSON.stringify(card)) return block;
        changed = true;
        return next;
    });
    return { blocks: changed ? updated : blocks, changed };
};
