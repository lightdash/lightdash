import { renderHook } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { describe, expect, it } from 'vitest';
import {
    ChatApiBaseContext,
    getStudioChatApiBase,
    useChatArtifactsUrl,
    useChatReadsItsAgent,
    useChatThreadsUrl,
} from './chatEndpoints';

const InStudio: FC<PropsWithChildren> = ({ children }) => (
    <ChatApiBaseContext.Provider value={getStudioChatApiBase('p1')}>
        {children}
    </ChatApiBaseContext.Provider>
);

describe('chat endpoints', () => {
    it('uses the agent threads endpoint for an ordinary chat', () => {
        const { result } = renderHook(() => ({
            threadsUrl: useChatThreadsUrl()('p1', 'a1'),
            artifactsUrl: useChatArtifactsUrl()('p1', 'a1'),
            readsItsAgent: useChatReadsItsAgent(),
        }));

        expect(result.current).toEqual({
            threadsUrl: '/projects/p1/aiAgents/a1/threads',
            artifactsUrl: '/projects/p1/aiAgents/a1/artifacts',
            readsItsAgent: true,
        });
    });

    it('uses the chat own endpoint, whatever the agent, when one is supplied', () => {
        const { result } = renderHook(
            () => ({
                threadsUrl: useChatThreadsUrl()('p1', 'a1'),
                artifactsUrl: useChatArtifactsUrl()('p1', 'a1'),
                readsItsAgent: useChatReadsItsAgent(),
            }),
            { wrapper: InStudio },
        );

        expect(result.current).toEqual({
            threadsUrl: '/projects/p1/semantic-studio/chat/threads',
            artifactsUrl: '/projects/p1/semantic-studio/chat/artifacts',
            readsItsAgent: false,
        });
    });
});
