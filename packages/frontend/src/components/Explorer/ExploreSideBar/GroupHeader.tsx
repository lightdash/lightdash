import { Group, NavLink, Text } from '@mantine-8/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

type GroupHeaderProps = {
    label: string;
    isExpanded: boolean;
    onToggle: () => void;
};

const GroupHeader: FC<GroupHeaderProps> = ({ label, isExpanded, onToggle }) => {
    return (
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
    );
};

export default GroupHeader;
