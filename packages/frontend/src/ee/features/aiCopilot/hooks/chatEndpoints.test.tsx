import { renderHook } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { describe, expect, it } from 'vitest';
import {
    ChatThreadsUrlContext,
    getStudioChatThreadsUrl,
    useChatReadsItsAgent,
    useChatThreadsUrl,
} from './chatEndpoints';

const InStudio: FC<PropsWithChildren> = ({ children }) => (
    <ChatThreadsUrlContext.Provider value={getStudioChatThreadsUrl('p1')}>
        {children}
    </ChatThreadsUrlContext.Provider>
);

describe('chat endpoints', () => {
    it('uses the agent threads endpoint for an ordinary chat', () => {
        const { result } = renderHook(() => ({
            threadsUrl: useChatThreadsUrl()('p1', 'a1'),
            readsItsAgent: useChatReadsItsAgent(),
        }));

        expect(result.current).toEqual({
            threadsUrl: '/projects/p1/aiAgents/a1/threads',
            readsItsAgent: true,
        });
    });

    it('uses the chat own endpoint, whatever the agent, when one is supplied', () => {
        const { result } = renderHook(
            () => ({
                threadsUrl: useChatThreadsUrl()('p1', 'a1'),
                readsItsAgent: useChatReadsItsAgent(),
            }),
            { wrapper: InStudio },
        );

        expect(result.current).toEqual({
            threadsUrl: '/projects/p1/semantic-studio/chat/threads',
            readsItsAgent: false,
        });
    });
});
