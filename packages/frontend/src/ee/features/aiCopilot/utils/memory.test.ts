import { getAiAgentMemoryPreview } from './memory';

describe('getAiAgentMemoryPreview', () => {
    it('preserves markdown and limits the preview to 256 characters', () => {
        const memory = `**Revenue definition** ${'a'.repeat(300)}`;

        expect(getAiAgentMemoryPreview(memory)).toBe(memory.slice(0, 256));
    });
});
