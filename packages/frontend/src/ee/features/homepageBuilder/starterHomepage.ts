import {
    type HomepageBlock,
    type HomepageCollectionItemRef,
    type HomepageConfig,
    type HomepageOpening,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import { getDefaultQuickActions } from './blocks/quickActionDefaults';

/**
 * The layout a brand-new homepage starts from — a block-for-block copy of what
 * day-0 already renders, in the same order (favorites, hero, key spaces,
 * recently viewed, pinned). Publishing the first homepage should keep the page
 * people were already looking at, not drop them onto a different one.
 */
export const buildStarterHomepage = ({
    opening,
    canAskAi,
    pinnedItems,
    keySpaceUuids = [],
}: {
    /** What the page opens on — the admin's choice, already resolved. */
    opening: HomepageOpening;
    /** Whether Ask AI is usable at all, which decides only whether it appears
     * as a quick action in the content-first preset. */
    canAskAi: boolean;
    pinnedItems: HomepageCollectionItemRef[];
    keySpaceUuids?: string[];
}): HomepageConfig => {
    const asksFirst = opening === 'ask-first';
    const row = (block: HomepageBlock) => ({ id: uuidv4(), blocks: [block] });

    const rows = [
        row({
            id: uuidv4(),
            type: 'favorites',
            config: { title: 'My favorites' },
        }),
        asksFirst
            ? row({
                  id: uuidv4(),
                  type: 'ask-ai-hero',
                  config: { showGreeting: true },
              })
            : row({
                  id: uuidv4(),
                  type: 'greeting',
                  config: {
                      subtitle:
                          'Pick up where you left off, or start something new.',
                  },
              }),
    ];

    // The same spaces day-0 leads its body with, so the first draft opens on
    // the page people were already looking at.
    if (keySpaceUuids.length > 0) {
        rows.push(
            row({
                id: uuidv4(),
                type: 'collection',
                config: {
                    title: 'Start here',
                    items: keySpaceUuids.map((uuid) => ({
                        contentType: 'space' as const,
                        uuid,
                    })),
                },
            }),
        );
    }

    // Day-0 pairs the greeting with quick actions; the AI hero stands alone.
    if (!asksFirst) {
        rows.push(
            row({
                id: uuidv4(),
                type: 'quick-actions',
                config: { actions: getDefaultQuickActions(canAskAi) },
            }),
            row({
                id: uuidv4(),
                type: 'recent',
                config: { title: 'Recently viewed' },
            }),
        );
    }

    if (pinnedItems.length > 0) {
        rows.push(
            row({
                id: uuidv4(),
                type: 'collection',
                config: { title: 'Pinned', items: pinnedItems },
            }),
        );
    }

    return { version: 1, rows };
};
