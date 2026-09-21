import { FeatureFlags, type AiAgentThread } from '@lightdash/common';
import { useEffect, useMemo, useRef } from 'react';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import {
    clearPreview,
    selectArtifactPreview,
    setPreview,
} from '../store/aiArtifactSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../store/hooks';
import { useDeepResearchThreadRunRegistrationState } from './useDeepResearch';

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
    const fastDecisions =
        useServerFeatureFlag(FeatureFlags.AiAgentFastDecisions).data
            ?.enabled === true;
    const dispatch = useAiAgentStoreDispatch();
    const artifact = useAiAgentStoreSelector(selectArtifactPreview);
    const {
        registrations: deepResearchRegistrations,
        isReady: isDeepResearchRegistrationLookupReady,
    } = useDeepResearchThreadRunRegistrationState({
        projectUuid: threadUuid ? projectUuid : undefined,
        threadUuid: threadUuid ?? '',
    });
    const deepResearchPromptUuids = useMemo(
        () =>
            new Set(
                deepResearchRegistrations.map(
                    (registration) => registration.promptUuid,
                ),
            ),
        [deepResearchRegistrations],
    );

    const lastHandledMessageUuidRef = useRef<string | null>(null);
    const lastAutomaticVersionUuidRef = useRef<string | null>(null);
    const prevArtifactRef = useRef<typeof artifact>(null);

    useEffect(() => {
        return () => {
            dispatch(clearPreview());
            lastHandledMessageUuidRef.current = null;
            lastAutomaticVersionUuidRef.current = null;
            prevArtifactRef.current = null;
        };
    }, [projectUuid, agentUuid, threadUuid, dispatch]);

    const latestAssistantMessage = useMemo(() => {
        const msg = thread?.messages?.at(-1);
        if (
            !msg ||
            msg.role !== 'assistant' ||
            !msg.artifacts ||
            msg.artifacts.length === 0 ||
            deepResearchPromptUuids.has(msg.uuid)
        ) {
            return null;
        }
        if (!isDeepResearchRegistrationLookupReady) {
            return null;
        }
        return msg;
    }, [
        deepResearchPromptUuids,
        isDeepResearchRegistrationLookupReady,
        thread,
    ]);

    // Track when user manually closes an artifact
    useEffect(() => {
        if (!artifact && prevArtifactRef.current && latestAssistantMessage) {
            const wasLatestArtifactOpen =
                prevArtifactRef.current.messageUuid ===
                latestAssistantMessage.uuid;
            if (wasLatestArtifactOpen) {
                lastHandledMessageUuidRef.current = latestAssistantMessage.uuid;
                lastAutomaticVersionUuidRef.current = null;
            }
        }
        if (
            artifact &&
            prevArtifactRef.current &&
            artifact.messageUuid === lastHandledMessageUuidRef.current &&
            artifact.versionUuid !== lastAutomaticVersionUuidRef.current
        ) {
            // A deliberate selection takes ownership away from auto-preview.
            lastAutomaticVersionUuidRef.current = null;
        }
        prevArtifactRef.current = artifact;
    }, [artifact, latestAssistantMessage]);

    // Auto-open on artifact landing; the bubble shows "Finishing up…" until
    // the closing text streams in so the panel doesn't read as a focus-yank.
    useEffect(() => {
        if (
            !projectUuid ||
            !agentUuid ||
            !threadUuid ||
            !latestAssistantMessage
        )
            return;
        const latestArtifact = latestAssistantMessage.artifacts?.at(-1);
        if (!latestArtifact) return;
        const followsCurrentArtifact =
            fastDecisions &&
            artifact?.messageUuid === latestAssistantMessage.uuid &&
            artifact.artifactUuid === latestArtifact.artifactUuid &&
            artifact.versionUuid === lastAutomaticVersionUuidRef.current;
        if (
            lastHandledMessageUuidRef.current === latestAssistantMessage.uuid &&
            !followsCurrentArtifact
        )
            return;
        if (
            artifact?.messageUuid === latestAssistantMessage.uuid &&
            (!followsCurrentArtifact ||
                artifact.versionUuid === latestArtifact.versionUuid)
        )
            return;
        dispatch(
            setPreview({
                type: 'artifact',
                artifactUuid: latestArtifact.artifactUuid,
                versionUuid: latestArtifact.versionUuid,
                messageUuid: latestAssistantMessage.uuid,
                threadUuid,
                projectUuid,
                agentUuid,
            }),
        );

        lastHandledMessageUuidRef.current = latestAssistantMessage.uuid;
        lastAutomaticVersionUuidRef.current = latestArtifact.versionUuid;
    }, [
        fastDecisions,
        artifact,
        latestAssistantMessage,
        projectUuid,
        agentUuid,
        threadUuid,
        dispatch,
    ]);
};
