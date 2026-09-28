import type { AiAgentMessageAssistant } from '@lightdash/common';
import { Box, Paper } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import { AiArtifactPanel } from './AiArtifactPanel';

type AiArtifactInlineProps = {
    artifact: NonNullable<AiAgentMessageAssistant['artifacts']>[0];
    message: AiAgentMessageAssistant;
    projectUuid: string;
    agentUuid: string;
};

export const AiArtifactInline: FC<AiArtifactInlineProps> = memo(
    ({ artifact, message, projectUuid, agentUuid }) => {
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

        return (
            <Paper
                variant="dotted"
                p="xs"
                radius="md"
                h="400px"
                shadow={'none'}
            >
                {artifactJsx}
            </Paper>
        );
    },
);
