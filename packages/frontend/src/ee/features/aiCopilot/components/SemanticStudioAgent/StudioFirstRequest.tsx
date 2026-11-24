import { Button, Group, Stack } from '@mantine/core';
import { type FC } from 'react';
import { STUDIO_STARTERS } from '../../../../../features/semanticStudio/studioStarters';
import { AgentChatInput } from '../ChatElements/AgentChatInput';
import { useStudioAgent } from './useSemanticStudioChat';

/** A warehouse with nothing modelled yet: what a semantic layer is, and the way in. */
export const StudioFirstRequest: FC<{
    projectUuid: string;
    onAsk: (prompt: string) => void;
}> = ({ projectUuid, onAsk }) => {
    const { agent } = useStudioAgent(projectUuid);
    return (
        <Stack gap="sm" w="100%" maw={520}>
            {/* The chat's own composer, so asking here feels the same as asking there. */}
            <AgentChatInput
                allowAttachments={false}
                accessCalloutVariant="inline"
                showSuggestions={false}
                onSubmit={({ message }) => {
                    if (message.trim()) onAsk(message.trim());
                }}
                placeholder="What should I build first?"
                projectUuid={projectUuid}
                agentUuid={agent?.uuid}
                fullWidth
            />
            <Group gap="xs" justify="center">
                {STUDIO_STARTERS.map(({ label, prompt }) => (
                    <Button
                        key={label}
                        size="xs"
                        variant="default"
                        onClick={() => onAsk(prompt)}
                    >
                        {label}
                    </Button>
                ))}
            </Group>
        </Stack>
    );
};
