import { Box, Stack, Switch, Text } from '@mantine-8/core';
import { type FC } from 'react';
import useApp from '../../../../providers/App/useApp';
import { useAiAgentButtonVisibility } from '../../aiCopilot/hooks/useAiAgentsButtonVisibility';
import { DayOneAskInput } from '../DayOneAskInput';
import { getGreeting } from '../greeting';
import { RecommendedActionsChecklist } from './RecommendedActionsChecklist';
import { type BlockComponentProps, type BuildComponentProps } from './types';
import { useRecommendedActions } from './useRecommendedActions';

// The day-0 hero, as a reusable unit: greeting + the real agent chat
// composer with live suggestions. Shared between DayOneHomepage (always
// greets) and this block (greeting is a per-homepage toggle). The setup
// checklist replaces the suggestion chips when enabled.
export const AskAiHero: FC<{
    projectUuid: string;
    showGreeting: boolean;
    showRecommendedActions: boolean;
    // In the builder the composer is shown as a preview: it looks real but is
    // inert, so editing admins can't accidentally start a conversation.
    preview?: boolean;
}> = ({
    projectUuid,
    showGreeting,
    showRecommendedActions,
    preview = false,
}) => {
    const { user } = useApp();
    const actions = useRecommendedActions(projectUuid);
    const showChecklist = showRecommendedActions && actions.hasPendingActions;
    return (
        <Stack gap={16} align="center" w="100%">
            {showGreeting && (
                <Text
                    component="h1"
                    fz={23}
                    fw={600}
                    lts="-0.02em"
                    lh={1.2}
                    ta="center"
                    m={0}
                >
                    {getGreeting(user.data?.firstName)}. What do you want to
                    know?
                </Text>
            )}
            <Box w="100%">
                <DayOneAskInput projectUuid={projectUuid} preview={preview} />
            </Box>
            {showChecklist && (
                <RecommendedActionsChecklist
                    projectUuid={projectUuid}
                    actions={actions}
                />
            )}
        </Stack>
    );
};

export const AskAiHeroBlockView: FC<BlockComponentProps> = ({
    block,
    projectUuid,
}) => {
    const isAiEnabled = useAiAgentButtonVisibility();
    if (block.type !== 'ask-ai-hero' || !isAiEnabled) return null;
    // The greeting follows its toggle regardless of the block's position; it
    // still renders inline mid-page rather than only in the hero slot.
    return (
        <AskAiHero
            projectUuid={projectUuid}
            showGreeting={block.config.showGreeting}
            showRecommendedActions={
                block.config.showRecommendedActions === true
            }
        />
    );
};

export const AskAiHeroBlockBuild: FC<BuildComponentProps> = ({
    block,
    projectUuid,
    onChange,
}) => {
    if (block.type !== 'ask-ai-hero') return null;
    return (
        <Stack gap="sm">
            <AskAiHero
                projectUuid={projectUuid}
                showGreeting={block.config.showGreeting}
                showRecommendedActions={
                    block.config.showRecommendedActions === true
                }
                preview
            />
            <Switch
                label="Show greeting"
                checked={block.config.showGreeting}
                onChange={(e) =>
                    onChange({
                        ...block,
                        config: {
                            ...block.config,
                            showGreeting: e.currentTarget.checked,
                        },
                    })
                }
            />
            <Switch
                label="Show recommended actions"
                checked={block.config.showRecommendedActions === true}
                onChange={(e) =>
                    onChange({
                        ...block,
                        config: {
                            ...block.config,
                            showRecommendedActions: e.currentTarget.checked,
                        },
                    })
                }
            />
        </Stack>
    );
};
