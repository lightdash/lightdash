import { type AiAgentThread } from '@lightdash/common';
import { useEffect, useMemo, useRef } from 'react';
import { clearArtifact, setArtifact } from '../store/aiArtifactSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../store/hooks';

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
        if (!msg || msg.role !== 'assistant' || !msg.artifact) return null;
        return msg;
    }, [thread]);

    // Track when user manually closes an artifact
    useEffect(() => {
        if (!artifact && prevArtifactRef.current && latestAssistantMessage) {
            const wasLatestArtifactOpen =
                prevArtifactRef.current.message.uuid ===
                latestAssistantMessage.uuid;
            if (wasLatestArtifactOpen) {
                lastHandledMessageUuidRef.current = latestAssistantMessage.uuid;
            }
        }
        prevArtifactRef.current = artifact;
    }, [artifact, latestAssistantMessage]);

    // Auto-select latest artifact if not already handled
    useEffect(() => {
        if (!projectUuid || !agentUuid || !latestAssistantMessage) return;
        if (lastHandledMessageUuidRef.current === latestAssistantMessage.uuid)
            return;
        if (artifact?.message.uuid === latestAssistantMessage.uuid) return;

        dispatch(
            setArtifact({
                artifactUuid: latestAssistantMessage.artifact!.uuid,
                versionUuid: latestAssistantMessage.artifact!.versionUuid,
                message: latestAssistantMessage,
                projectUuid,
                agentUuid,
            }),
        );

        lastHandledMessageUuidRef.current = latestAssistantMessage.uuid;
    }, [artifact, latestAssistantMessage, projectUuid, agentUuid, dispatch]);
};
