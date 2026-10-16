import { Group, NavLink, Text } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

type SectionHeaderProps = {
    label: string;
    tourValue: string;
    isExpanded: boolean;
    onToggle: () => void;
};

const SectionHeader: FC<SectionHeaderProps> = ({
    label,
    tourValue,
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
            data-tour-value={tourValue}
            disableRightSectionRotation
            rightSection={<></>}
            leftSection={
                <MantineIcon
                    icon={isExpanded ? IconChevronDown : IconChevronRight}
                    size={12}
                    color="dimmed"
                />
            }
            label={
                <Group>
                    <Text fw={500} fz="xs" c="dimmed">
                        {label}
                    </Text>
                </Group>
            }
        />
    );
};

export default SectionHeader;
