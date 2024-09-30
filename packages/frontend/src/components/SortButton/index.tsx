import { type SortField } from '@lightdash/common';
import { Badge, Popover, Text } from '@mantine/core';
import { useClickOutside, useDisclosure } from '@mantine/hooks';
import { IconChevronDown } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';
import Sorting from './Sorting';

export type Props = {
    sorts: SortField[];
    isEditMode: boolean;
};

const SortButton: FC<Props> = ({ sorts, isEditMode }) => {
    const [opened, { open, close, toggle }] = useDisclosure();
    const ref = useClickOutside(
        () => setTimeout(() => close(), 0),
        ['mouseup', 'touchend'],
    );

    return (
        <Popover
            opened={opened}
            position="top"
            withArrow
            shadow="md"
            arrowSize={10}
            offset={2}
        >
            <Popover.Target>
                <Badge
                    onClick={isEditMode ? toggle : undefined}
                    onMouseEnter={isEditMode ? undefined : open}
                    onMouseLeave={isEditMode ? undefined : close}
                    // variant={isEditMode ? 'filled' : 'light'}
                    variant="light"
                    color="blue"
                    sx={{
                        textTransform: 'unset',
                        cursor: isEditMode ? 'pointer' : 'default',
                        '&:hover': isEditMode ? { opacity: 0.8 } : undefined,
                        '&:active': isEditMode ? { opacity: 0.9 } : undefined,
                    }}
                    rightSection={
                        isEditMode ? (
                            <MantineIcon icon={IconChevronDown} size="sm" />
                        ) : null
                    }
                >
                    <Text span fw={500}>
                        Sorted by
                    </Text>{' '}
                    {sorts.length === 1 ? '1 field' : `${sorts.length} fields`}
                </Badge>
            </Popover.Target>

            <Popover.Dropdown>
                <Sorting ref={ref} sorts={sorts} isEditMode={isEditMode} />
            </Popover.Dropdown>
        </Popover>
    );
};

export default SortButton;
