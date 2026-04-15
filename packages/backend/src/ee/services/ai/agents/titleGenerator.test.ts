import { ModelMessage } from 'ai';
import { getFallbackTitle } from './titleGenerator';

const TITLE_MAX_LENGTH_CHARS = 60;

describe('getFallbackTitle', () => {
    it('returns the first user message content when it fits within max length', () => {
        const messages: ModelMessage[] = [
            { role: 'user', content: 'Short question about revenue' },
        ];
        expect(getFallbackTitle(messages)).toBe('Short question about revenue');
    });

    it('truncates at word boundary and appends "..." when content exceeds max length', () => {
        const longContent =
            'What is the total revenue broken down by region for all of last year';
        expect(longContent.length).toBeGreaterThan(TITLE_MAX_LENGTH_CHARS);
        const result = getFallbackTitle([
            { role: 'user', content: longContent },
        ]);
        expect(result.length).toBeLessThanOrEqual(TITLE_MAX_LENGTH_CHARS);
        expect(result.endsWith('...')).toBe(true);
        // Should not cut mid-word
        const withoutEllipsis = result.slice(0, -3);
        const lastChar = withoutEllipsis[withoutEllipsis.length - 1];
        expect(lastChar).not.toBe(' ');
    });

    it('returns "New conversation" when messages array is empty', () => {
        expect(getFallbackTitle([])).toBe('New conversation');
    });

    it('returns "New conversation" when there are no user messages', () => {
        const messages: ModelMessage[] = [
            {
                role: 'assistant',
                content: [{ type: 'text', text: 'Hello, how can I help?' }],
            },
        ];
        expect(getFallbackTitle(messages)).toBe('New conversation');
    });

    it('skips non-user messages and uses the first user message', () => {
        const messages: ModelMessage[] = [
            {
                role: 'assistant',
                content: [{ type: 'text', text: 'I am the assistant' }],
            },
            { role: 'user', content: 'Show me top 5 customers by revenue' },
        ];
        expect(getFallbackTitle(messages)).toBe(
            'Show me top 5 customers by revenue',
        );
    });

    it('returns "New conversation" when first user message has empty content', () => {
        const messages: ModelMessage[] = [{ role: 'user', content: '' }];
        expect(getFallbackTitle(messages)).toBe('New conversation');
    });

    it('returns "New conversation" for non-string user message content', () => {
        const messages: ModelMessage[] = [
            {
                role: 'user',
                content: [{ type: 'text', text: 'multimodal content' }],
            },
        ];
        expect(getFallbackTitle(messages)).toBe('New conversation');
    });

    it('handles a content string exactly at the max length limit', () => {
        // Exactly 60 characters
        const exactContent = 'a'.repeat(TITLE_MAX_LENGTH_CHARS);
        const result = getFallbackTitle([
            { role: 'user', content: exactContent },
        ]);
        expect(result).toBe(exactContent);
        expect(result.endsWith('...')).toBe(false);
    });
});
