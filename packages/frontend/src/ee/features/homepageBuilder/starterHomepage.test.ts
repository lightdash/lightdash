import { describe, expect, it } from 'vitest';
import { buildStarterHomepage } from './starterHomepage';

const types = ({
    opening,
    canAskAi = opening === 'ask-first',
    pins = [],
    spaces = [],
}: {
    opening: 'ask-first' | 'content-first';
    canAskAi?: boolean;
    pins?: { contentType: 'chart'; uuid: string }[];
    spaces?: string[];
}) =>
    buildStarterHomepage({
        opening,
        canAskAi,
        pinnedItems: pins,
        keySpaceUuids: spaces,
    }).rows.flatMap((row) => row.blocks.map((block) => block.type));

describe('buildStarterHomepage', () => {
    // The first homepage must reproduce day-0 block for block, in order, so
    // publishing it doesn't change the page out from under viewers.
    it('mirrors the content-first day-0 page', () => {
        expect(types({ opening: 'content-first' })).toEqual([
            'favorites',
            'greeting',
            'quick-actions',
            'recent',
        ]);
    });

    it('leads with the Ask AI hero when the opening is ask-first', () => {
        expect(types({ opening: 'ask-first' })).toEqual([
            'favorites',
            'ask-ai-hero',
        ]);
    });

    it('builds the content-first preset even when AI is available', () => {
        expect(
            types({ opening: 'content-first', canAskAi: true }),
        ).not.toContain('ask-ai-hero');
    });

    it('keeps Ask AI as a quick action in the content-first preset', () => {
        const config = buildStarterHomepage({
            opening: 'content-first',
            canAskAi: true,
            pinnedItems: [],
        });
        const quickActions = config.rows
            .flatMap((row) => row.blocks)
            .find((block) => block.type === 'quick-actions');
        expect(quickActions).toMatchObject({
            config: { actions: expect.arrayContaining([{ type: 'ask-ai' }]) },
        });
    });

    it('leaves Ask AI out of the quick actions when the project has no agent', () => {
        const config = buildStarterHomepage({
            opening: 'content-first',
            canAskAi: false,
            pinnedItems: [],
        });
        const quickActions = config.rows
            .flatMap((row) => row.blocks)
            .find((block) => block.type === 'quick-actions');
        expect(quickActions).toMatchObject({
            config: {
                actions: expect.not.arrayContaining([{ type: 'ask-ai' }]),
            },
        });
    });

    it('carries the project pins across as a collection', () => {
        const pins = [{ contentType: 'chart' as const, uuid: 'chart-1' }];
        const config = buildStarterHomepage({
            opening: 'content-first',
            canAskAi: false,
            pinnedItems: pins,
        });
        const collection = config.rows
            .flatMap((row) => row.blocks)
            .find(
                (block) =>
                    block.type === 'collection' &&
                    block.config.title === 'Pinned',
            );

        expect(collection).toMatchObject({
            config: { title: 'Pinned', items: pins },
        });
    });

    it('carries the day-0 key spaces across as a collection', () => {
        const config = buildStarterHomepage({
            opening: 'ask-first',
            canAskAi: true,
            pinnedItems: [],
            keySpaceUuids: ['space-1', 'space-2'],
        });
        const collection = config.rows
            .flatMap((row) => row.blocks)
            .find(
                (block) =>
                    block.type === 'collection' &&
                    block.config.title === 'Start here',
            );

        expect(collection).toMatchObject({
            config: {
                title: 'Start here',
                items: [
                    { contentType: 'space', uuid: 'space-1' },
                    { contentType: 'space', uuid: 'space-2' },
                ],
            },
        });
    });

    it('leaves out the pinned collection when nothing is pinned', () => {
        expect(types({ opening: 'content-first' })).not.toContain('collection');
    });
});
