import type { AiAgentMessageAssistant } from '@lightdash/common';
import { Box, Paper } from '@mantine-8/core';
import { type FC } from 'react';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import { AiArtifactPanel } from './AiArtifactPanel';

type AiArtifactInlineProps = {
    artifact: NonNullable<AiAgentMessageAssistant['artifacts']>[0];
    message: AiAgentMessageAssistant;
    projectUuid: string;
    agentUuid: string;
};

export const AiArtifactInline: FC<AiArtifactInlineProps> = ({
    artifact,
    message,
    projectUuid,
    agentUuid,
}) => {
    const artifactJsx = (
        <ErrorBoundary>
            <AiArtifactPanel
                artifact={{
                    artifactUuid: artifact.artifactUuid,
                    versionUuid: artifact.versionUuid,
                    messageUuid: message.uuid,
                    threadUuid: message.threadUuid,
                    projectUuid: projectUuid,
                    agentUuid: agentUuid,
                }}
                showCloseButton={false}
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
            style={{ height: '400px' }}
            shadow={'none'}
        >
            {artifactJsx}
        </Paper>
    );
};
