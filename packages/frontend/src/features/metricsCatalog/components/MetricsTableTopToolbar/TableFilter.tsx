import { isSummaryExploreError, type SummaryExplore } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Checkbox,
    Group,
    Popover,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { clsx } from '@mantine/core';
import { IconSearch, IconTable, IconX } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useExplores } from '../../../../hooks/useExplores';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import styles from './TableFilter.module.css';

type TableFilterProps = {
    selectedTables: string[];
    setSelectedTables: (tables: string[]) => void;
};

const TableFilter: FC<TableFilterProps> = ({
    selectedTables,
    setSelectedTables,
}) => {
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const [searchValue, setSearchValue] = useState('');

    const { data: explores, isLoading } = useExplores(projectUuid, true);

    // Filter out explores with errors and get table options
    const tableOptions = useMemo(() => {
        if (!explores) return [];
        return explores
            .filter(
                (explore): explore is SummaryExplore =>
                    !isSummaryExploreError(explore),
            )
            .map((explore) => ({
                name: explore.name,
                label: explore.label,
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [explores]);

    // Filter tables by search
    const filteredTables = useMemo(() => {
        if (!searchValue) return tableOptions;
        const searchLower = searchValue.toLowerCase();
        return tableOptions.filter(
            (table) =>
                table.name.toLowerCase().includes(searchLower) ||
                table.label.toLowerCase().includes(searchLower),
        );
    }, [tableOptions, searchValue]);

    const hasSelectedTables = selectedTables.length > 0;

    const tableNames = useMemo(() => {
        return tableOptions
            .filter((table) => selectedTables.includes(table.name))
            .map((table) => table.label)
            .join(', ');
    }, [tableOptions, selectedTables]);

    const buttonLabel = hasSelectedTables ? tableNames : 'All tables';

    return (
        <Group gap={2}>
            <Popover width={300} position="bottom-start" shadow="sm">
                <Popover.Target>
                    <Tooltip
                        withinPortal
                        label="Filter metrics by table"
                        openDelay={200}
                        maw={250}
                        fz="xs"
                    >
                        <Button
                            h={32}
                            c="ldGray.7"
                            fw={500}
                            fz="sm"
                            variant="default"
                            radius="md"
                            py="xs"
                            px="sm"
                            leftSection={
                                <MantineIcon
                                    icon={IconTable}
                                    size="md"
                                    color={
                                        hasSelectedTables
                                            ? 'indigo.5'
                                            : 'ldGray.5'
                                    }
                                />
                            }
                            loading={isLoading}
                            className={clsx(
                                styles.filterButton,
                                hasSelectedTables &&
                                    styles.filterButtonSelected,
                            )}
                            classNames={{
                                label: styles.filterButtonLabel,
                            }}
                        >
                            {buttonLabel}
                        </Button>
                    </Tooltip>
                </Popover.Target>
                <Popover.Dropdown p="sm">
                    <Stack gap={4}>
                        <Text fz="xs" c="ldGray.6" fw={600}>
                            Filter by tables:
                        </Text>

                        {tableOptions.length > 5 && (
                            <TextInput
                                size="xs"
                                placeholder="Search tables..."
                                value={searchValue}
                                onChange={(e) =>
                                    setSearchValue(e.currentTarget.value)
                                }
                                rightSection={
                                    searchValue ? (
                                        <ActionIcon
                                            size="xs"
                                            onClick={() => setSearchValue('')}
                                        >
                                            <MantineIcon icon={IconX} />
                                        </ActionIcon>
                                    ) : (
                                        <MantineIcon
                                            icon={IconSearch}
                                            color="ldGray.5"
                                        />
                                    )
                                }
                            />
                        )}

                        {tableOptions.length === 0 && (
                            <Text fz="xs" fw={500} c="ldGray.6">
                                No tables available.
                            </Text>
                        )}

                        <Stack
                            gap="xs"
                            mah={300}
                            mt="xxs"
                            className={styles.scrollableList}
                        >
                            {filteredTables.map((table) => (
                                <Checkbox
                                    key={table.name}
                                    label={table.label}
                                    checked={selectedTables.includes(
                                        table.name,
                                    )}
                                    size="xs"
                                    classNames={{
                                        body: styles.checkbox,
                                        input: styles.checkboxInput,
                                    }}
                                    onChange={() => {
                                        if (
                                            selectedTables.includes(table.name)
                                        ) {
                                            setSelectedTables(
                                                selectedTables.filter(
                                                    (t) => t !== table.name,
                                                ),
                                            );
                                        } else {
                                            setSelectedTables([
                                                ...selectedTables,
                                                table.name,
                                            ]);
                                        }
                                    }}
                                />
                            ))}
                            {filteredTables.length === 0 &&
                                tableOptions.length > 0 && (
                                    <Text fz="xs" c="ldGray.5">
                                        No tables match your search.
                                    </Text>
                                )}
                        </Stack>
                    </Stack>
                </Popover.Dropdown>
            </Popover>
            {hasSelectedTables && (
                <Tooltip label="Clear all table filters">
                    <ActionIcon
                        size="xs"
                        color="ldGray.5"
                        variant="subtle"
                        onClick={() => {
                            setSelectedTables([]);
                        }}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Tooltip>
            )}
        </Group>
    );
};

export default TableFilter;
