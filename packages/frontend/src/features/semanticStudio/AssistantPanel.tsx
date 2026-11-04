/**
 * The fixed sidebar where the semantic layer agent will live. Not built yet,
 * so it shows only its header with a Coming soon tag.
 */
import { Badge, Box, Text } from '@mantine/core';
import { type FC } from 'react';
import { AiAgentIcon } from '../../ee/features/aiCopilot/components/AiAgentIcon';
import classes from './AssistantPanel.module.css';

export const AssistantPanel: FC = () => (
    <Box className={classes.panel}>
        <Box className={classes.header}>
            <AiAgentIcon size={16} />
            <Text fz="sm" fw={600}>
                Ask AI
            </Text>
            <Badge size="xs" variant="default" radius="sm">
                Coming soon
            </Badge>
        </Box>
    </Box>
);
