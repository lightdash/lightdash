import type { AiAgentMessageAssistant } from '@lightdash/common';
import { Box, Group, Paper, Text, UnstyledButton } from '@mantine/core';
import {
    IconChevronDown,
    IconChevronRight,
    IconTable,
} from '@tabler/icons-react';
import { memo, useContext, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import { AiArtifactPanel } from './AiArtifactPanel';
import { QuietCardsContext } from './ToolCalls/quietCards';

type AiArtifactInlineProps = {
    artifact: NonNullable<AiAgentMessageAssistant['artifacts']>[0];
    message: AiAgentMessageAssistant;
    projectUuid: string;
    agentUuid: string;
};

export const AiArtifactInline: FC<AiArtifactInlineProps> = memo(
    ({ artifact, message, projectUuid, agentUuid }) => {
        // A narrow panel keeps results to one line until opened, so they do not crowd the conversation.
        const quiet = useContext(QuietCardsContext);
        const [isOpen, setIsOpen] = useState(!quiet);
        const artifactRef = useMemo(
            () => ({
                artifactUuid: artifact.artifactUuid,
                versionUuid: artifact.versionUuid,
                messageUuid: message.uuid,
                threadUuid: message.threadUuid,
                projectUuid,
                agentUuid,
            }),
            [
                artifact.artifactUuid,
                artifact.versionUuid,
                message.uuid,
                message.threadUuid,
                projectUuid,
                agentUuid,
            ],
        );
        const artifactJsx = (
            <ErrorBoundary>
                <AiArtifactPanel
                    artifact={artifactRef}
                    showCloseButton={false}
                    variant="inline"
                />
            </ErrorBoundary>
        );

        if (artifact.artifactType === 'dashboard') {
            return (
                <Box h="800px" p={0}>
                    {artifactJsx}
                </Box>
            );
        }

        const toggle = quiet ? (
            <UnstyledButton
                w="100%"
                py={4}
                aria-expanded={isOpen}
                onClick={() => setIsOpen(!isOpen)}
            >
                <Group gap={6} wrap="nowrap">
                    <MantineIcon
                        icon={isOpen ? IconChevronDown : IconChevronRight}
                        size={12}
                        color="dimmed"
                    />
                    <MantineIcon icon={IconTable} size={14} color="dimmed" />
                    <Text fz="xs" c="dimmed" truncate>
                        {artifact.title ?? 'Results'}
                    </Text>
                </Group>
            </UnstyledButton>
        ) : null;
        if (!isOpen) return toggle;

        return (
            <>
                {toggle}
                <Paper
                    variant="dotted"
                    p="xs"
                    radius="md"
                    h="400px"
                    shadow={'none'}
                >
                    {artifactJsx}
                </Paper>
            </>
        );
    },
);
