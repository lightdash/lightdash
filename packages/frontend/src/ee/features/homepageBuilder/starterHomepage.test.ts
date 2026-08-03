import { type HomepageOpening } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildStarterHomepage } from './starterHomepage';

const types = (
    opening: HomepageOpening,
    pins: { contentType: 'chart'; uuid: string }[] = [],
) =>
    buildStarterHomepage(opening, pins).rows.flatMap((row) =>
        row.blocks.map((block) => block.type),
    );

describe('buildStarterHomepage', () => {
    // The first homepage must reproduce day-0 block for block, in order, so
    // publishing it doesn't change the page out from under viewers.
    it('mirrors the content-first day-0 page', () => {
        expect(types('content-first')).toEqual([
            'favorites',
            'greeting',
            'quick-actions',
            'recent',
            'collection',
        ]);
    });

    it('leads with the Ask AI hero for the ask-first opening', () => {
        expect(types('ask-first')).toEqual([
            'favorites',
            'ask-ai-hero',
            'recent',
            'collection',
        ]);
    });

    it('includes a live most-popular collection, mirroring day-0', () => {
        const config = buildStarterHomepage('content-first', []);
        const collections = config.rows
            .flatMap((row) => row.blocks)
            .filter((block) => block.type === 'collection');

        expect(collections).toHaveLength(1);
        expect(collections[0]).toMatchObject({
            config: {
                title: 'Most popular',
                source: 'most-viewed',
                items: [],
            },
        });
    });

    it('tracks the live pin list rather than copying it', () => {
        const pins = [{ contentType: 'chart' as const, uuid: 'chart-1' }];
        const config = buildStarterHomepage('content-first', pins);
        const pinnedCollection = config.rows
            .flatMap((row) => row.blocks)
            .find(
                (block) =>
                    block.type === 'collection' &&
                    block.config.title === 'Pinned',
            );

        // A frozen copy would stop following pins after publish.
        expect(pinnedCollection).toMatchObject({
            config: { title: 'Pinned', source: 'pinned', items: [] },
        });
    });

    it('leaves out the pinned collection when nothing is pinned', () => {
        const config = buildStarterHomepage('content-first', []);
        const titles = config.rows
            .flatMap((row) => row.blocks)
            .filter((block) => block.type === 'collection')
            .map((block) => block.config.title);

        expect(titles).not.toContain('Pinned');
    });
});
