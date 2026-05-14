import { Box, Group, NavLink, Text } from '@mantine-8/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

const INDENT_PER_DEPTH = 16;

type GroupHeaderProps = {
    label: string;
    isExpanded: boolean;
    onToggle: () => void;
    depth?: number;
};

const GroupHeader: FC<GroupHeaderProps> = ({
    label,
    isExpanded,
    onToggle,
    depth = 0,
}) => {
    return (
        <Box style={{ paddingLeft: `${depth * INDENT_PER_DEPTH}px` }}>
            <NavLink
                opened={isExpanded}
                onClick={onToggle}
                // --start moves chevron to the left
                // mostly hardcoded, to match mantine's internal sizes
                disableRightSectionRotation
                rightSection={<></>}
                leftSection={
                    <MantineIcon
                        icon={isExpanded ? IconChevronDown : IconChevronRight}
                        size={14}
                        style={{
                            margin: 1,
                        }}
                    />
                }
                // --end
                label={
                    <Group>
                        <Text fz="sm" fw={500} c="ldGray.7">
                            {label}
                        </Text>
                    </Group>
                }
            />
        </Box>
    );
};

export default GroupHeader;
