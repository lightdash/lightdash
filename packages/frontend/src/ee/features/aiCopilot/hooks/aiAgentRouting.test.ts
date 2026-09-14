import { describe, expect, it } from 'vitest';
import { getThreadUuidFromPathname } from './aiAgentRouting';

describe('getThreadUuidFromPathname', () => {
    it('reads the thread from a full-page thread route', () => {
        expect(
            getThreadUuidFromPathname(
                '/projects/project-1/ai-agents/agent-1/threads/thread-1',
            ),
        ).toBe('thread-1');
    });

    it('reads the thread from an embed thread route', () => {
        expect(
            getThreadUuidFromPathname(
                '/embed/project-1/ai-agents/agent-1/threads/thread-2/',
            ),
        ).toBe('thread-2');
    });

    it('returns null off a thread route', () => {
        expect(
            getThreadUuidFromPathname('/projects/project-1/ai-agents/agent-1'),
        ).toBeNull();
        expect(
            getThreadUuidFromPathname('/projects/project-1/home'),
        ).toBeNull();
    });
});
