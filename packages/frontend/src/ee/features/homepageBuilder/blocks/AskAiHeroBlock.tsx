import { Box, Stack, Switch, Text } from '@mantine-8/core';
import { type FC } from 'react';
import useApp from '../../../../providers/App/useApp';
import { useAiAgentButtonVisibility } from '../../aiCopilot/hooks/useAiAgentsButtonVisibility';
import { DayOneAskInput } from '../DayOneAskInput';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const dayPart = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
};

// The day-0 hero, as a reusable unit: greeting + the real agent chat
// composer with live suggestions. Shared between DayOneHomepage (always
// greets) and this block (greeting is a per-homepage toggle).
export const AskAiHero: FC<{
    projectUuid: string;
    showGreeting: boolean;
    // In the builder the composer is shown as a preview: it looks real but is
    // inert, so editing admins can't accidentally start a conversation.
    preview?: boolean;
}> = ({ projectUuid, showGreeting, preview = false }) => {
    const { user } = useApp();
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
                    Good {dayPart()}, {user.data?.firstName}. What do you want
                    to know?
                </Text>
            )}
            <Box w="100%">
                <DayOneAskInput projectUuid={projectUuid} preview={preview} />
            </Box>
        </Stack>
    );
};

export const AskAiHeroBlockView: FC<BlockComponentProps> = ({
    block,
    projectUuid,
    presentation = 'inline',
}) => {
    const isAiEnabled = useAiAgentButtonVisibility();
    if (block.type !== 'ask-ai-hero' || !isAiEnabled) return null;
    // Mid-page the composer renders inline: the greeting is hero-context only,
    // even when the homepage has it toggled on.
    return (
        <AskAiHero
            projectUuid={projectUuid}
            showGreeting={presentation === 'hero' && block.config.showGreeting}
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
                preview
            />
            <Switch
                label="Show greeting"
                checked={block.config.showGreeting}
                onChange={(e) =>
                    onChange({
                        ...block,
                        config: { showGreeting: e.currentTarget.checked },
                    })
                }
            />
        </Stack>
    );
};
