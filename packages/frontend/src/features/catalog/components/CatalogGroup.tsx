import { Group, NavLink } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { type FC } from 'react';
import { useToggle } from 'react-use';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    label: string;
};

export const CatalogGroup: FC<React.PropsWithChildren<Props>> = ({
    label,
    children,
}) => {
    const [isOpen, toggleOpen] = useToggle(false);

    return (
        <NavLink
            opened={isOpen}
            onClick={toggleOpen}
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
                        transform: isOpen ? 'rotate(90deg)' : undefined,
                    }}
                />
            }
            // --end
            label={<Group>{label}</Group>}
        >
            {children}
        </NavLink>
    );
};
