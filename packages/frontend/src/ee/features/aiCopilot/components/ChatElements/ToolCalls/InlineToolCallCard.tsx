import { TOOL_DISPLAY_MESSAGES, type ToolName } from '@lightdash/common';
import {
    Box,
    Collapse,
    Group,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine-8/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useState, type FC } from 'react';
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
    const [expanded, setExpanded] = useState(false);

    if (!hasDescription) {
        return (
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
        );
    }

    return (
        <Stack gap={4}>
            <UnstyledButton
                onClick={() => setExpanded((prev) => !prev)}
                aria-expanded={expanded}
            >
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
                    <MantineIcon
                        icon={expanded ? IconChevronDown : IconChevronRight}
                        size={10}
                        stroke={1.6}
                        color="ldGray.5"
                    />
                </Group>
            </UnstyledButton>
            <Collapse in={expanded}>
                <Box pl="md">
                    <ToolCallDescription
                        toolName={toolName}
                        toolCall={toolCall}
                    />
                </Box>
            </Collapse>
        </Stack>
    );
};
