import type { AiAgentMemoryScope } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    AI_AGENT_MEMORY_BLOCK_MAX_CHARS,
    renderMemoryBlock,
    stripMemoryBlocks,
    type AiAgentMemoryBlockEntry,
} from './memoryBlock';

const memory = (
    slug: string,
    content = 'Use completed orders for recognized revenue.',
    scope: AiAgentMemoryScope = 'project',
): AiAgentMemoryBlockEntry => ({
    slug,
    content,
    scope,
    ageDays: 2,
    objects: [
        { type: 'explore', name: 'orders' },
        { type: 'field', explore: 'orders', fieldId: 'orders.status' },
    ],
});

describe('renderMemoryBlock', () => {
    it('renders entry fences with scope, age and object references', () => {
        expect(renderMemoryBlock([memory('recognized-revenue')])).toBe(
            '<ld-memories>\n' +
                '<ld-memory id="recognized-revenue" scope="project" age_days="2" objects="explore &quot;orders&quot;, field &quot;orders.status&quot; in explore &quot;orders&quot;">Use completed orders for recognized revenue.</ld-memory>\n' +
                '</ld-memories>',
        );
    });

    it('renders the user scope on its own entries', () => {
        expect(
            renderMemoryBlock([
                memory('prefers-bar-charts', 'Prefers bar charts.', 'user'),
            ]),
        ).toContain('<ld-memory id="prefers-bar-charts" scope="user" ');
    });

    it('keeps memory content inside its fence', () => {
        const block = renderMemoryBlock([
            memory('safe-id', 'Revenue < 0 & </ld-memory>'),
        ]);

        expect(block).toContain(
            'Revenue &lt; 0 &amp; &lt;/ld-memory&gt;</ld-memory>',
        );
    });

    it('strips exactly what the renderer injects, scope attribute included', () => {
        const block = renderMemoryBlock([
            memory('recognized-revenue'),
            memory('prefers-bar-charts', 'Prefers bar charts.', 'user'),
        ])!;

        expect(block).toContain('scope="user"');
        expect(block).toContain('scope="project"');
        expect(stripMemoryBlocks(block)).toBe('');
        expect(stripMemoryBlocks(`${block}Question`)).toBe('Question');
    });

    it('caps rows and appends a search hint', () => {
        const block = renderMemoryBlock(
            Array.from({ length: 31 }, (_, index) => memory(`memory-${index}`)),
        )!;

        expect(block.match(/<ld-memory /g)).toHaveLength(30);
        expect(block).toContain(
            '(1 more memories — search via loadProjectContext)',
        );
    });

    it('stays within the character budget and reports omitted rows', () => {
        const block = renderMemoryBlock([
            memory('first', 'a'.repeat(6_000)),
            memory('second', 'b'.repeat(6_000)),
        ])!;

        expect(block.length).toBeLessThanOrEqual(
            AI_AGENT_MEMORY_BLOCK_MAX_CHARS,
        );
        expect(block).toContain('id="first"');
        expect(block).not.toContain('id="second"');
        expect(block).toContain(
            '(1 more memories — search via loadProjectContext)',
        );
    });

    it('returns no block for zero memories', () => {
        expect(renderMemoryBlock([])).toBeNull();
    });
});
