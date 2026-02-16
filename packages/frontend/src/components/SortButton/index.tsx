import { isField, type SortField } from '@lightdash/common';
import { Badge, Group, Popover, Text } from '@mantine-8/core';
import {
    IconArrowDown,
    IconArrowUp,
    IconChevronDown,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useColumns } from '../../hooks/useColumns';
import MantineIcon from '../common/MantineIcon';
import classes from './SortButton.module.css';
import Sorting from './Sorting';

export type Props = {
    sorts: SortField[];
    isEditMode: boolean;
};

const SortButton: FC<Props> = ({ sorts, isEditMode }) => {
    const columns = useColumns();

    const getSortText = () => {
        if (sorts.length === 0) return 'No sort';
        if (sorts.length === 1) {
            const sort = sorts[0];
            const column = columns.find((c) => c.id === sort.fieldId);
            const item = column?.meta?.item;
            if (!item) return '1 field';
            return isField(item) ? item.label : item.name;
        }
        return `${sorts.length} fields`;
    };

    return (
        <Popover position="top-start" shadow="subtle" disabled={!isEditMode}>
            <Popover.Target>
                <Badge
                    variant="light"
                    color="blue"
                    className={`${classes.badge} ${isEditMode ? classes.interactive : ''}`}
                    rightSection={
                        isEditMode ? (
                            <MantineIcon icon={IconChevronDown} size="sm" />
                        ) : null
                    }
                >
                    <Group gap={2}>
                        {sorts.length === 1 && (
                            <MantineIcon
                                icon={
                                    sorts[0].descending
                                        ? IconArrowDown
                                        : IconArrowUp
                                }
                                strokeWidth={3}
                                size="sm"
                            />
                        )}
                        <Text span fw={400} fz="xs">
                            Sorted by
                        </Text>
                        <Text fw={600} fz="xs">
                            {getSortText()}
                        </Text>
                    </Group>
                </Badge>
            </Popover.Target>

            <Popover.Dropdown p="xs">
                <Sorting sorts={sorts} isEditMode={isEditMode} />
            </Popover.Dropdown>
        </Popover>
    );
};

export default SortButton;
