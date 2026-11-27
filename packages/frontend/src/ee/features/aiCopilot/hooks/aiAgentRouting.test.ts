import { describe, expect, it } from 'vitest';
import {
    getAiAgentArtifactResultsUrl,
    getThreadUuidFromPathname,
} from './aiAgentRouting';

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

describe('getAiAgentArtifactResultsUrl', () => {
    const artifact = {
        projectUuid: 'p1',
        agentUuid: 'a1',
        artifactUuid: 'art1',
        versionUuid: 'v1',
        queryUuid: 'q1',
        cached: false,
    };

    it("reads an agent's artifact results under the agent", () => {
        expect(getAiAgentArtifactResultsUrl(artifact)).toBe(
            '/projects/p1/aiAgents/a1/artifacts/art1/versions/v1/query-results?queryUuid=q1&cached=false',
        );
    });

    it('reads them under the chat own artifacts endpoint when one is given', () => {
        expect(
            getAiAgentArtifactResultsUrl({
                ...artifact,
                artifactsUrl: '/projects/p1/semantic-studio/chat/artifacts',
            }),
        ).toBe(
            '/projects/p1/semantic-studio/chat/artifacts/art1/versions/v1/query-results?queryUuid=q1&cached=false',
        );
    });
});
