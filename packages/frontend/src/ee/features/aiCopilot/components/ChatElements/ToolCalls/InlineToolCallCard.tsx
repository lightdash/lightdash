import { TOOL_DISPLAY_MESSAGES, type ToolName } from '@lightdash/common';
import { Box, Group, Stack, Text } from '@mantine-8/core';
import { type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { ToolCallDescription } from './descriptions/ToolCallDescription';
import { getToolIcon } from './utils/toolIcons';
import { type ToolCallSummary } from './utils/types';

const TOOLS_WITHOUT_DESCRIPTION = new Set<ToolName>([
    'improveContext',
    'proposeChange',
    'runSavedChart',
    'listWarehouseTables',
]);

type InlineToolCallCardProps = {
    toolName: ToolName;
    toolCall: ToolCallSummary;
};

export const InlineToolCallCard: FC<InlineToolCallCardProps> = ({
    toolName,
    toolCall,
}) => {
    const IconComponent = getToolIcon(toolName);
    const label = TOOL_DISPLAY_MESSAGES[toolName];
    const hasDescription = !TOOLS_WITHOUT_DESCRIPTION.has(toolName);

    return (
        <Stack gap={4}>
            <Group gap={6} align="center" wrap="nowrap">
                <MantineIcon
                    icon={IconComponent}
                    size={12}
                    stroke={1.6}
                    color="indigo.4"
                />
                <Text size="xs" fw={500} c="ldGray.7">
                    {label}
                </Text>
            </Group>
            {hasDescription ? (
                <Box pl="md">
                    <ToolCallDescription
                        toolName={toolName}
                        toolCall={toolCall}
                    />
                </Box>
            ) : null}
        </Stack>
    );
};
