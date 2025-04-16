import { isField, type SortField } from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Group,
    Popover,
    Select,
    Text,
} from '@mantine/core';
import {
    IconArrowDown,
    IconArrowUp,
    IconChevronDown,
    IconPlus,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { useColumns } from '../../hooks/useColumns';
import useExplorerContext from '../../providers/Explorer/useExplorerContext';
import MantineIcon from '../common/MantineIcon';
import Sorting from './Sorting';

export type Props = {
    sorts: SortField[];
    isEditMode: boolean;
};

const SortButton: FC<Props> = ({ sorts, isEditMode }) => {
    const columns = useColumns();
    const addSortField = useExplorerContext(
        (context) => context.actions.addSortField,
    );

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

    const [showSortFieldSelector, setShowSortFieldSelector] = useState(false);
    const availableColumnsToAddToSort = useMemo(
        () =>
            columns
                .map((c) => ({
                    label: isField(c.meta?.item)
                        ? c.meta?.item?.label
                        : c.meta?.item?.name,
                    value: c.id || '',
                }))
                .filter((c) => !sorts.some((s) => s.fieldId === c.value)),
        [columns, sorts],
    );

    return (
        <Popover
            position="right"
            withArrow
            shadow="subtle"
            radius="md"
            withinPortal
            disabled={!isEditMode}
        >
            <Popover.Target>
                <Badge
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
                    <Group spacing={2}>
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
                        <Text span fw={400}>
                            Sorted by
                        </Text>
                        <Text fw={600}>{getSortText()}</Text>
                    </Group>
                </Badge>
            </Popover.Target>

            <Popover.Dropdown p="xs">
                <Sorting sorts={sorts} isEditMode={isEditMode} />
                {isEditMode && availableColumnsToAddToSort.length > 0 && (
                    <Box p="xs">
                        <Button
                            variant="subtle"
                            size="xs"
                            onClick={() => {
                                setShowSortFieldSelector(true);
                            }}
                            compact
                            leftIcon={<MantineIcon icon={IconPlus} />}
                        >
                            Add sort
                        </Button>
                        {showSortFieldSelector && (
                            <Select
                                placeholder={
                                    availableColumnsToAddToSort.length === 0
                                        ? 'No available columns'
                                        : 'Add sort field'
                                }
                                size="xs"
                                data={availableColumnsToAddToSort}
                                withinPortal
                                onChange={(value: string) => {
                                    addSortField(value);
                                    setShowSortFieldSelector(false);
                                }}
                            />
                        )}
                    </Box>
                )}
            </Popover.Dropdown>
        </Popover>
    );
};

export default SortButton;
