import { Group, NavLink } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
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
            icon={
                <MantineIcon
                    icon={IconChevronRight}
                    size={14}
                    style={{
                        margin: 1,
                        transition: 'transform 200ms ease',
                        transform: isExpanded ? 'rotate(90deg)' : undefined,
                    }}
                />
            }
            // --end
            label={<Group>{label}</Group>}
        />
    );
};

export default GroupHeader;
