import { Group, NavLink, Text } from '@mantine-8/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

type SectionHeaderProps = {
    label: string;
    isExpanded: boolean;
    onToggle: () => void;
};

const SectionHeader: FC<SectionHeaderProps> = ({
    label,
    isExpanded,
    onToggle,
}) => {
    return (
        <NavLink
            opened={isExpanded}
            onClick={onToggle}
            disableRightSectionRotation
            rightSection={<></>}
            leftSection={
                <MantineIcon
                    icon={isExpanded ? IconChevronDown : IconChevronRight}
                    size={12}
                    c="ldGray.6"
                />
            }
            label={
                <Group>
                    <Text fw={500} fz="xs" c="ldGray.6">
                        {label}
                    </Text>
                </Group>
            }
        />
    );
};

export default SectionHeader;
