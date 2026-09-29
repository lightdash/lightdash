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
    requestedArtifact?: { artifactUuid: string; versionUuid: string };
}

export const useAiAgentThreadArtifact = ({
    projectUuid,
    agentUuid,
    threadUuid,
    thread,
    requestedArtifact,
}: UseAiAgentThreadArtifactOptions) => {
    const fastDecisions =
        useServerFeatureFlag(FeatureFlags.AiAgentFastDecisions).data
            ?.enabled === true;
    const dispatch = useAiAgentStoreDispatch();
    const artifact = useAiAgentStoreSelector(selectArtifactPreview);
    const requestedArtifactUuid = requestedArtifact?.artifactUuid;
    const requestedVersionUuid = requestedArtifact?.versionUuid;
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
    const handledRequestedArtifactRef = useRef<string | null>(null);
    const prevArtifactRef = useRef<typeof artifact>(null);

    useEffect(() => {
        return () => {
            dispatch(clearPreview());
            lastHandledMessageUuidRef.current = null;
            lastAutomaticVersionUuidRef.current = null;
            handledRequestedArtifactRef.current = null;
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

    const requestedMessage = useMemo(
        () =>
            requestedArtifactUuid && requestedVersionUuid
                ? thread?.messages.find(
                      (message) =>
                          message.role === 'assistant' &&
                          message.artifacts?.some(
                              (item) =>
                                  item.artifactUuid === requestedArtifactUuid &&
                                  item.versionUuid === requestedVersionUuid,
                          ),
                  )
                : undefined,
        [requestedArtifactUuid, requestedVersionUuid, thread],
    );

    useEffect(() => {
        if (!requestedArtifactUuid || !requestedVersionUuid) {
            handledRequestedArtifactRef.current = null;
            return;
        }
        if (!projectUuid || !agentUuid || !threadUuid || !requestedMessage)
            return;
        const requestKey = `${threadUuid}:${requestedArtifactUuid}:${requestedVersionUuid}`;
        if (handledRequestedArtifactRef.current === requestKey) {
            // The latest message may become known after the requested artifact
            // opens. Keep auto-preview from replacing the requested panel when
            // the download link is consumed.
            if (latestAssistantMessage)
                lastHandledMessageUuidRef.current = latestAssistantMessage.uuid;
            return;
        }
        handledRequestedArtifactRef.current = requestKey;
        lastHandledMessageUuidRef.current =
            latestAssistantMessage?.uuid ?? requestedMessage.uuid;
        lastAutomaticVersionUuidRef.current = null;
        if (
            artifact?.artifactUuid === requestedArtifactUuid &&
            artifact.versionUuid === requestedVersionUuid &&
            artifact.messageUuid === requestedMessage.uuid
        )
            return;
        dispatch(
            setPreview({
                type: 'artifact',
                artifactUuid: requestedArtifactUuid,
                versionUuid: requestedVersionUuid,
                messageUuid: requestedMessage.uuid,
                threadUuid,
                projectUuid,
                agentUuid,
            }),
        );
    }, [
        requestedArtifactUuid,
        requestedVersionUuid,
        requestedMessage,
        artifact,
        projectUuid,
        agentUuid,
        threadUuid,
        dispatch,
        latestAssistantMessage,
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
            !latestAssistantMessage ||
            requestedMessage
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
        requestedMessage,
        projectUuid,
        agentUuid,
        threadUuid,
        dispatch,
    ]);
};
