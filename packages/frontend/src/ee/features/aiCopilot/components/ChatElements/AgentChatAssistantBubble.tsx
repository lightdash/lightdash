import { type AiAgentMessageAssistant } from '@lightdash/common';
import { Stack } from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import { memo, useCallback, type FC } from 'react';
import { useUpdatePromptFeedbackMutation } from '../../hooks/useProjectAiAgents';
import { setArtifact } from '../../store/aiArtifactSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import { useAiAgentThreadMessageStreaming } from '../../streaming/useAiAgentThreadStreamQuery';
import AgentChatDebugDrawer from './AgentChatDebugDrawer';
import { AiArtifactInline } from './AiArtifactInline';
import { AiArtifactButton } from './ArtifactButton/AiArtifactButton';
import { AssistantBubbleActionIcons } from './AssistantBubbleActionIcons';
import { AssistantBubbleContent } from './AssistantBubbleContent';
import { AssistantBubbleFeedbackControls } from './AssistantBubbleFeedbackControls';

type Props = {
    message: AiAgentMessageAssistant;
    isActive?: boolean;
    debug?: boolean;
    projectUuid: string;
    agentUuid: string;
    onAddToEvals?: (promptUuid: string) => void;
    renderArtifactsInline?: boolean;
    showAddToEvalsButton?: boolean;
};

export const AssistantBubble: FC<Props> = memo(
    ({
        message,
        isActive = false,
        debug = false,
        projectUuid,
        agentUuid,
        onAddToEvals,
        renderArtifactsInline = false,
        showAddToEvalsButton = false,
    }) => {
        const artifact = useAiAgentStoreSelector(
            (state) => state.aiArtifact.artifact,
        );
        const dispatch = useAiAgentStoreDispatch();

        if (!projectUuid) throw new Error(`Project Uuid not found`);
        if (!agentUuid) throw new Error(`Agent Uuid not found`);

        const [isDrawerOpen, { open: openDrawer, close: closeDrawer }] =
            useDisclosure(debug);

        const updateFeedbackMutation = useUpdatePromptFeedbackMutation(
            projectUuid,
            agentUuid,
            message.threadUuid,
        );

        const upVoted = message.humanScore === 1;
        const downVoted = message.humanScore === -1;
        const hasRating = upVoted || downVoted;

        const [popoverOpened, { open: openPopover, close: closePopover }] =
            useDisclosure(false);

        const handleUpvote = useCallback(() => {
            updateFeedbackMutation.mutate({
                messageUuid: message.uuid,
                humanScore: upVoted ? 0 : 1,
            });
        }, [updateFeedbackMutation, message.uuid, upVoted]);

        const handleDownvote = useCallback(() => {
            if (downVoted) {
                updateFeedbackMutation.mutate({
                    messageUuid: message.uuid,
                    humanScore: 0,
                });
            } else {
                updateFeedbackMutation.mutate({
                    messageUuid: message.uuid,
                    humanScore: -1,
                });
                openPopover();
            }
        }, [updateFeedbackMutation, message.uuid, downVoted, openPopover]);

        const handleSubmitFeedback = useCallback(
            (feedbackTextValue: string) => {
                if (feedbackTextValue.trim().length !== 0) {
                    updateFeedbackMutation.mutate({
                        messageUuid: message.uuid,
                        humanScore: -1,
                        humanFeedback: feedbackTextValue.trim(),
                    });
                }
                closePopover();
            },
            [updateFeedbackMutation, message.uuid, closePopover],
        );

        const handleCancelFeedback = useCallback(() => {
            closePopover();
        }, [closePopover]);

        const isPending = message.status === 'pending';
        const isLoading =
            useAiAgentThreadMessageStreaming(
                message.threadUuid,
                message.uuid,
            ) || isPending;

        const isArtifactAvailable =
            !!(message.artifacts && message.artifacts.length > 0) && !isPending;

        return (
            <Stack
                pos="relative"
                w="100%"
                gap="xs"
                bg={isActive ? 'gray.0' : 'transparent'}
                style={{
                    overflow: 'unset',
                    borderStartStartRadius: '0px',
                }}
            >
                <AssistantBubbleContent
                    message={message}
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                />

                {isArtifactAvailable && projectUuid && agentUuid && (
                    <Stack gap="xs">
                        {renderArtifactsInline
                            ? // Render artifacts inline directly
                              message.artifacts!.map((messageArtifact) => (
                                  <AiArtifactInline
                                      key={`${messageArtifact.artifactUuid}-${messageArtifact.versionUuid}`}
                                      artifact={messageArtifact}
                                      message={message}
                                      projectUuid={projectUuid}
                                      agentUuid={agentUuid}
                                  />
                              ))
                            : // Render artifact buttons that open modals
                              message.artifacts!.map((messageArtifact) => (
                                  <AiArtifactButton
                                      key={`${messageArtifact.artifactUuid}-${messageArtifact.versionUuid}`}
                                      onClick={() => {
                                          if (
                                              artifact?.artifactUuid ===
                                                  messageArtifact.artifactUuid &&
                                              artifact?.versionUuid ===
                                                  messageArtifact.versionUuid
                                          ) {
                                              return;
                                          }
                                          dispatch(
                                              setArtifact({
                                                  artifactUuid:
                                                      messageArtifact.artifactUuid,
                                                  versionUuid:
                                                      messageArtifact.versionUuid,
                                                  messageUuid: message.uuid,
                                                  threadUuid:
                                                      message.threadUuid,
                                                  projectUuid: projectUuid,
                                                  agentUuid: agentUuid,
                                              }),
                                          );
                                      }}
                                      isArtifactOpen={
                                          artifact?.artifactUuid ===
                                              messageArtifact.artifactUuid &&
                                          artifact?.versionUuid ===
                                              messageArtifact.versionUuid
                                      }
                                      artifact={messageArtifact}
                                  />
                              ))}
                    </Stack>
                )}
                <AssistantBubbleFeedbackControls
                    popoverOpened={popoverOpened}
                    humanFeedback={message.humanFeedback}
                    humanScore={message.humanScore}
                />
                {!isLoading && (
                    <AssistantBubbleActionIcons
                        messageContent={message.message ?? ''}
                        hasRating={hasRating}
                        upVoted={upVoted}
                        downVoted={downVoted}
                        onUpvote={handleUpvote}
                        onDownvote={handleDownvote}
                        showAddToEvalsButton={showAddToEvalsButton}
                        onAddToEvals={onAddToEvals}
                        messageUuid={message.uuid}
                        isArtifactAvailable={isArtifactAvailable}
                        onOpenDebug={openDrawer}
                        popoverOpened={popoverOpened}
                        closePopover={closePopover}
                        handleSubmitFeedback={handleSubmitFeedback}
                        handleCancelFeedback={handleCancelFeedback}
                    />
                )}

                <AgentChatDebugDrawer
                    agentUuid={agentUuid}
                    projectUuid={projectUuid}
                    artifacts={message.artifacts}
                    toolCalls={message.toolCalls}
                    isVisualizationAvailable={isArtifactAvailable}
                    isDrawerOpen={isDrawerOpen}
                    onClose={closeDrawer}
                />
            </Stack>
        );
    },
);
