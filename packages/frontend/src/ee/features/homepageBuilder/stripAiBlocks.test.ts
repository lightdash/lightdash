import { type HomepageConfig } from '@lightdash/common';
import { stripUnavailableAiBlocks } from './stripAiBlocks';

const config = (rows: HomepageConfig['rows']): HomepageConfig => ({
    version: 1,
    rows,
});

it('keeps a hero that still greets, drops one that only composes', () => {
    const greeting = stripUnavailableAiBlocks(
        config([
            {
                id: 'r1',
                blocks: [
                    {
                        id: 'b1',
                        type: 'ask-ai-hero',
                        config: { showGreeting: true },
                    },
                ],
            },
        ]),
    );
    expect(greeting.rows).toHaveLength(1);

    const composerOnly = stripUnavailableAiBlocks(
        config([
            {
                id: 'r1',
                blocks: [
                    {
                        id: 'b1',
                        type: 'ask-ai-hero',
                        config: { showGreeting: false },
                    },
                ],
            },
        ]),
    );
    expect(composerOnly.rows).toEqual([]);
});

it('drops the ask-ai quick action but keeps the rest', () => {
    const result = stripUnavailableAiBlocks(
        config([
            {
                id: 'r1',
                blocks: [
                    {
                        id: 'b1',
                        type: 'quick-actions',
                        config: {
                            actions: [
                                { type: 'ask-ai' },
                                { type: 'run-query' },
                            ],
                        },
                    },
                ],
            },
        ]),
    );
    expect(result.rows[0].blocks[0]).toEqual({
        id: 'b1',
        type: 'quick-actions',
        config: { actions: [{ type: 'run-query' }] },
    });
});

it('drops a quick-actions block left with nothing to show', () => {
    const result = stripUnavailableAiBlocks(
        config([
            {
                id: 'r1',
                blocks: [
                    {
                        id: 'b1',
                        type: 'quick-actions',
                        config: { actions: [{ type: 'ask-ai' }] },
                    },
                ],
            },
            {
                id: 'r2',
                blocks: [
                    {
                        id: 'b2',
                        type: 'markdown',
                        config: { content: '# Hello' },
                    },
                ],
            },
        ]),
    );
    expect(result.rows.map((row) => row.id)).toEqual(['r2']);
});

it('leaves non-AI blocks untouched', () => {
    const rows: HomepageConfig['rows'] = [
        {
            id: 'r1',
            blocks: [
                { id: 'b1', type: 'markdown', config: { content: '# Hi' } },
                { id: 'b2', type: 'favorites', config: { title: 'Favorites' } },
            ],
        },
    ];
    expect(stripUnavailableAiBlocks(config(rows)).rows).toEqual(rows);
});
