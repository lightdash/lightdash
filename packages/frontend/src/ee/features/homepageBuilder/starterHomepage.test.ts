import { describe, expect, it } from 'vitest';
import { buildStarterHomepage } from './starterHomepage';

const types = (canAskAi: boolean, pins: { contentType: 'chart'; uuid: string }[] = []) =>
    buildStarterHomepage(canAskAi, pins).rows.flatMap((row) =>
        row.blocks.map((block) => block.type),
    );

describe('buildStarterHomepage', () => {
    // The first homepage must reproduce day-0 block for block, in order, so
    // publishing it doesn't change the page out from under viewers.
    it('mirrors the non-AI day-0 page', () => {
        expect(types(false)).toEqual([
            'favorites',
            'greeting',
            'quick-actions',
            'recent',
        ]);
    });

    it('leads with the Ask AI hero when the project has an agent', () => {
        expect(types(true)).toEqual(['favorites', 'ask-ai-hero']);
    });

    it('carries the project pins across as a collection', () => {
        const pins = [{ contentType: 'chart' as const, uuid: 'chart-1' }];
        const config = buildStarterHomepage(false, pins);
        const collection = config.rows
            .flatMap((row) => row.blocks)
            .find((block) => block.type === 'collection');

        expect(collection).toMatchObject({
            config: { title: 'Pinned', items: pins },
        });
    });

    it('leaves out the pinned collection when nothing is pinned', () => {
        expect(types(false)).not.toContain('collection');
    });
});
