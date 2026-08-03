import {
    type HomepageBlock,
    type HomepageCollectionItemRef,
    type HomepageConfig,
    type HomepageOpening,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import { getDefaultQuickActions } from './blocks/quickActionDefaults';
import { DEFAULT_GREETING_SUBTITLE } from './greeting';

/**
 * The layout a brand-new homepage starts from — a block-for-block copy of what
 * day-0 already renders, in the same order (favorites, hero, key spaces,
 * recently viewed, pinned). Publishing the first homepage should keep the page
 * people were already looking at, not drop them onto a different one.
 */
export const buildStarterHomepage = (
    opening: HomepageOpening,
    pinnedItems: HomepageCollectionItemRef[],
    keySpaceUuids: string[] = [],
): HomepageConfig => {
    const row = (block: HomepageBlock) => ({ id: uuidv4(), blocks: [block] });

    const rows = [
        row({
            id: uuidv4(),
            type: 'favorites',
            config: { title: 'My favorites' },
        }),
        opening === 'ask-first'
            ? row({
                  id: uuidv4(),
                  type: 'ask-ai-hero',
                  config: { showGreeting: true },
              })
            : row({
                  id: uuidv4(),
                  type: 'greeting',
                  config: { subtitle: DEFAULT_GREETING_SUBTITLE },
              }),
    ];

    // Day-0 pairs the greeting with quick actions, directly under it — the
    // AI hero stands alone.
    if (opening === 'content-first') {
        rows.push(
            row({
                id: uuidv4(),
                type: 'quick-actions',
                config: { actions: getDefaultQuickActions() },
            }),
        );
    }

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

    // Day-0 shows Recently viewed for both openings, so the first draft must
    // keep it too.
    rows.push(
        row({
            id: uuidv4(),
            type: 'recent',
            config: { title: 'Recently viewed' },
        }),
    );

    // Live most-viewed source, mirroring day-0: the block keeps tracking what
    // the org actually uses rather than freezing a snapshot.
    rows.push(
        row({
            id: uuidv4(),
            type: 'collection',
            config: {
                title: 'Most popular',
                source: 'most-viewed',
                items: [],
            },
        }),
    );

    if (pinnedItems.length > 0) {
        rows.push(
            row({
                id: uuidv4(),
                type: 'collection',
                config: {
                    title: 'Pinned',
                    // The live pin list, not a copy of it: a frozen snapshot
                    // stops tracking pins the moment it's published, and
                    // everyone reasonably expects this block to follow them.
                    source: 'pinned',
                    items: [],
                },
            }),
        );
    }

    return { version: 1, rows };
};
