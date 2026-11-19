import { Group, NavLink, Text } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

type SectionHeaderProps = {
    label: string;
    count: number;
    isExpanded: boolean;
    onToggle: () => void;
};

const SectionHeader: FC<SectionHeaderProps> = ({
    label,
    count,
    isExpanded,
    onToggle,
}) => {
    return (
        <NavLink
            opened={isExpanded}
            onClick={onToggle}
            // Anchor for scope walkthroughs (data-tour-via): a collapsed
            // section of the list (Virtual Views), by its label.
            data-tour-anchor="explore-section"
            data-tour-hint="Open the {value} section"
            data-tour-value={label}
            disableRightSectionRotation
            rightSection={
                <MantineIcon
                    icon={isExpanded ? IconChevronDown : IconChevronRight}
                    size={12}
                    stroke={2}
                    color="dimmed"
                />
            }
            label={
                <Group gap={6} wrap="nowrap">
                    <Text fw={600} fz="xs">
                        {label}
                    </Text>
                    <Text fz="xs" c="dimmed">
                        {count}
                    </Text>
                </Group>
            }
        />
    );
};

export default SectionHeader;
