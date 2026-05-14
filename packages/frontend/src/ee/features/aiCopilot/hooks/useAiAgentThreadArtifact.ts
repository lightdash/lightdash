import { type AiAgentThread } from '@lightdash/common';
import { useEffect, useMemo, useRef } from 'react';
import { clearArtifact, setArtifact } from '../store/aiArtifactSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../store/hooks';
import { useAiAgentThreadStreaming } from '../streaming/useAiAgentThreadStreamQuery';

interface UseAiAgentThreadArtifactOptions {
    projectUuid: string | undefined;
    agentUuid: string | undefined;
    threadUuid: string | undefined;
    thread: AiAgentThread | undefined;
}

export const useAiAgentThreadArtifact = ({
    projectUuid,
    agentUuid,
    threadUuid,
    thread,
}: UseAiAgentThreadArtifactOptions) => {
    const dispatch = useAiAgentStoreDispatch();
    const artifact = useAiAgentStoreSelector(
        (state) => state.aiArtifact.artifact,
    );
    const isStreaming = useAiAgentThreadStreaming(threadUuid ?? '');

    const lastHandledMessageUuidRef = useRef<string | null>(null);
    const prevArtifactRef = useRef<typeof artifact>(null);

    useEffect(() => {
        return () => {
            dispatch(clearArtifact());
            lastHandledMessageUuidRef.current = null;
            prevArtifactRef.current = null;
        };
    }, [projectUuid, agentUuid, threadUuid, dispatch]);

    const latestAssistantMessage = useMemo(() => {
        const msg = thread?.messages?.at(-1);
        if (
            !msg ||
            msg.role !== 'assistant' ||
            !msg.artifacts ||
            msg.artifacts.length === 0
        )
            return null;
        return msg;
    }, [thread]);

    // Track when user manually closes an artifact
    useEffect(() => {
        if (!artifact && prevArtifactRef.current && latestAssistantMessage) {
            const wasLatestArtifactOpen =
                prevArtifactRef.current.messageUuid ===
                latestAssistantMessage.uuid;
            if (wasLatestArtifactOpen) {
                lastHandledMessageUuidRef.current = latestAssistantMessage.uuid;
            }
        }
        prevArtifactRef.current = artifact;
    }, [artifact, latestAssistantMessage]);

    // Auto-select latest artifact if not already handled. Defer while the
    // thread is still streaming — the artifact gets appended to
    // `message.artifacts` the moment its `runQuery`/`generateDashboard` tool
    // call resolves, which is well before the assistant finishes producing
    // its closing text. Opening the panel mid-stream yanks focus away from
    // the message the user is reading. When `isStreaming` flips to false the
    // hook re-runs and opens normally.
    useEffect(() => {
        if (
            !projectUuid ||
            !agentUuid ||
            !threadUuid ||
            !latestAssistantMessage
        )
            return;
        if (isStreaming) return;
        if (lastHandledMessageUuidRef.current === latestAssistantMessage.uuid)
            return;
        if (artifact?.messageUuid === latestAssistantMessage.uuid) return;

        const latestArtifact = latestAssistantMessage.artifacts?.at(-1);
        if (!latestArtifact) return;
        dispatch(
            setArtifact({
                artifactUuid: latestArtifact.artifactUuid,
                versionUuid: latestArtifact.versionUuid,
                messageUuid: latestAssistantMessage.uuid,
                threadUuid,
                projectUuid,
                agentUuid,
            }),
        );

        lastHandledMessageUuidRef.current = latestAssistantMessage.uuid;
    }, [
        artifact,
        isStreaming,
        latestAssistantMessage,
        projectUuid,
        agentUuid,
        threadUuid,
        dispatch,
    ]);
};
