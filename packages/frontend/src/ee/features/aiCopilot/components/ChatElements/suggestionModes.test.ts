import { describe, expect, it } from 'vitest';
import { getAgentSuggestionModes } from './suggestionModes';

describe('getAgentSuggestionModes', () => {
    it('disables post-response suggestions when the input is disabled', () => {
        expect(
            getAgentSuggestionModes({
                disabled: true,
                isMinimalMode: true,
                loading: false,
                messageCount: 2,
                latestAssistantMessageUuid: 'message-1',
                suggestionsEnabled: true,
                threadUuid: 'thread-1',
            }).postResponseMode,
        ).toBe(false);
    });

    it('enables post-response suggestions for writable idle threads', () => {
        expect(
            getAgentSuggestionModes({
                disabled: false,
                isMinimalMode: true,
                loading: false,
                messageCount: 2,
                latestAssistantMessageUuid: 'message-1',
                suggestionsEnabled: true,
                threadUuid: 'thread-1',
            }).postResponseMode,
        ).toBe(true);
    });

    it('disables empty-state suggestions when the input is disabled', () => {
        expect(
            getAgentSuggestionModes({
                disabled: true,
                isMinimalMode: false,
                loading: false,
                messageCount: 0,
                suggestionsEnabled: true,
            }).emptyStateMode,
        ).toBe(false);
    });
});
