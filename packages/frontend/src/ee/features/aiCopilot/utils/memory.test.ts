import { getAiAgentMemoryPreview, parseAiAgentMemorySections } from './memory';

describe('getAiAgentMemoryPreview', () => {
    it('preserves markdown and limits the preview to 256 characters', () => {
        const memory = `**Revenue definition** ${'a'.repeat(300)}`;

        expect(getAiAgentMemoryPreview(memory)).toBe(memory.slice(0, 256));
    });
});

describe('parseAiAgentMemorySections', () => {
    it('splits the standard memory markdown sections', () => {
        expect(
            parseAiAgentMemorySections(`## Memory

Use completed revenue.

## Evidence

- The user adopted the convention.

## Apply

Use it for future revenue questions.`),
        ).toEqual({
            memory: 'Use completed revenue.',
            evidence: '- The user adopted the convention.',
            apply: 'Use it for future revenue questions.',
        });
    });

    it('preserves unstructured markdown as the memory', () => {
        const value = '**Net revenue** excludes refunds.';

        expect(parseAiAgentMemorySections(value)).toEqual({
            memory: value,
            evidence: null,
            apply: null,
        });
    });

    it('does not parse section-like headings inside code fences', () => {
        const value = `## Memory

Keep this example:

\`\`\`md
## Evidence
Not a real section
\`\`\``;

        expect(parseAiAgentMemorySections(value)).toEqual({
            memory: `Keep this example:

\`\`\`md
## Evidence
Not a real section
\`\`\``,
            evidence: null,
            apply: null,
        });
    });

    it('only closes a fence with the same marker and sufficient length', () => {
        const value = `## Memory

Keep this example:

\`\`\`\`md
## Evidence
Not a real section
\`\`\`
## Apply
Still part of the example
\`\`\`\`

## Evidence

Actual evidence.`;

        expect(parseAiAgentMemorySections(value)).toEqual({
            memory: `Keep this example:

\`\`\`\`md
## Evidence
Not a real section
\`\`\`
## Apply
Still part of the example
\`\`\`\``,
            evidence: 'Actual evidence.',
            apply: null,
        });
    });
});
