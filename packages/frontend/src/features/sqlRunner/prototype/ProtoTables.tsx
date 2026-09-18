import { WarehouseTableType } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Group,
    Highlight,
    Paper,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue, useHover } from '@mantine/hooks';
import {
    IconChevronDown,
    IconChevronRight,
    IconCloudDataConnection,
    IconDatabase,
    IconEye,
    IconEyeTable,
    IconFolder,
    IconPlugConnected,
    IconSearch,
    IconTable,
    IconX,
    type Icon,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { CopyActionIcon } from '../../../components/common/CopyActionIcon';
import MantineIcon from '../../../components/common/MantineIcon';
import scrollAreaClasses from '../../../styles/ScrollArea.module.css';
import { useAppSelector } from '../store/hooks';
import { useProtoConnections } from './protoConnectionState';
import {
    buildConnectionTreeRows,
    defaultExpandedRowIds,
    filterConnectionsBySearch,
    qualifiedTableName,
    type ProtoTreeRow,
} from './protoTableRows';
import styles from './ProtoTables.module.css';

const getTableTypeDisplay = (
    tableType: WarehouseTableType | undefined,
): { icon: Icon; label: string } => {
    switch (tableType) {
        case WarehouseTableType.VIEW:
            return { icon: IconEye, label: 'View' };
        case WarehouseTableType.MATERIALIZED_VIEW:
            return { icon: IconEyeTable, label: 'Materialized view' };
        case WarehouseTableType.EXTERNAL:
            return { icon: IconCloudDataConnection, label: 'External table' };
        default:
            return { icon: IconTable, label: 'Table' };
    }
};

const Chevron: FC<{ isExpanded: boolean }> = ({ isExpanded }) => (
    <MantineIcon
        icon={isExpanded ? IconChevronDown : IconChevronRight}
        size={14}
        className={styles.chevron}
    />
);

const SwitchPrompt: FC = () => {
    const {
        pendingSwitch,
        confirmPendingSwitch,
        cancelPendingSwitch,
        activeConnection,
    } = useProtoConnections();
    if (!pendingSwitch) return null;

    return (
        <Paper
            withBorder
            p="xs"
            mb="xs"
            className={styles.switchPrompt}
            data-proto="switch-prompt"
        >
            <Stack gap="xs">
                <Text fz="sm" fw={600}>
                    Switch to {pendingSwitch.identity.connectionName}?
                </Text>
                <Text fz="xs" c="dimmed">
                    {pendingSwitch.qualifiedName} is on another connection. Your
                    editor has SQL that did not come from a table click, so
                    nothing has changed yet.
                </Text>
                <Group gap="xs">
                    <Button size="xs" onClick={confirmPendingSwitch}>
                        Switch and replace SQL
                    </Button>
                    <Button
                        size="xs"
                        variant="default"
                        onClick={cancelPendingSwitch}
                    >
                        Keep {activeConnection.name}
                    </Button>
                </Group>
            </Stack>
        </Paper>
    );
};

const TreeRow: FC<{
    row: ProtoTreeRow;
    search: string;
    onToggle: (rowId: string) => void;
}> = ({ row, search, onToggle }) => {
    const { activeConnection, onTableClick } = useProtoConnections();
    const quoteChar = useAppSelector((state) => state.sqlRunner.quoteChar);
    const { ref: hoverRef, hovered } = useHover();

    const depthStyle = {
        '--proto-depth': row.depth,
    } as React.CSSProperties;

    if (row.type === 'table') {
        const typeDisplay = getTableTypeDisplay(row.tableType);
        const qualifiedName = qualifiedTableName(row.identity, quoteChar);
        const isOnActiveConnection =
            row.identity.connectionId === activeConnection.id;

        return (
            <Box ref={hoverRef} pos="relative">
                <UnstyledButton
                    ff="inherit"
                    fz="sm"
                    style={depthStyle}
                    className={`${styles.treeRow} ${styles.tableRow}`}
                    onClick={() => onTableClick(row.identity)}
                    data-proto-connection={row.identity.connectionId}
                >
                    <Group gap="xs" wrap="nowrap">
                        <Box className={styles.chevronPlaceholder} />
                        <Tooltip label={typeDisplay.label} openDelay={400}>
                            <MantineIcon
                                icon={typeDisplay.icon}
                                size="sm"
                                className={styles.rowIcon}
                                aria-label={typeDisplay.label}
                            />
                        </Tooltip>
                        <Text
                            fz="sm"
                            truncate
                            c={isOnActiveConnection ? undefined : 'dimmed'}
                        >
                            <Highlight
                                component="span"
                                highlight={search}
                                inherit
                            >
                                {row.identity.table}
                            </Highlight>
                        </Text>
                    </Group>
                </UnstyledButton>
                <Box
                    className={styles.copyButton}
                    display={hovered ? 'block' : 'none'}
                >
                    <CopyActionIcon
                        value={qualifiedName}
                        copiedLabel="Copied to clipboard"
                        tooltipPosition="right"
                        size="xs"
                        bg="body"
                    />
                </Box>
            </Box>
        );
    }

    if (row.type === 'connection') {
        const isActive = row.connectionId === activeConnection.id;
        return (
            <UnstyledButton
                ff="inherit"
                style={depthStyle}
                className={`${styles.treeRow} ${styles.connectionRow}`}
                data-active={isActive || undefined}
                onClick={() => onToggle(row.id)}
            >
                <Group gap="xs" wrap="nowrap">
                    <Chevron isExpanded={row.isExpanded} />
                    <MantineIcon
                        icon={IconPlugConnected}
                        size="sm"
                        className={styles.rowIcon}
                    />
                    <Text fz="sm" fw={600} truncate>
                        {row.connectionName}
                    </Text>
                    {isActive && (
                        <Badge size="xs" variant="light" color="blue">
                            Active
                        </Badge>
                    )}
                    <Text fz="xs" c="dimmed" ml="auto">
                        {row.childCount}
                    </Text>
                </Group>
            </UnstyledButton>
        );
    }

    const isDatabase = row.type === 'database';
    return (
        <UnstyledButton
            ff="inherit"
            style={depthStyle}
            className={styles.treeRow}
            onClick={() => onToggle(row.id)}
        >
            <Group gap="xs" wrap="nowrap">
                <Chevron isExpanded={row.isExpanded} />
                <MantineIcon
                    icon={isDatabase ? IconDatabase : IconFolder}
                    size="sm"
                    className={styles.rowIcon}
                />
                <Text fz="sm" fw={isDatabase ? 600 : 500} truncate>
                    {isDatabase ? row.database : row.schema}
                </Text>
                <Text fz="xs" c="dimmed" ml="auto">
                    {row.childCount}
                </Text>
            </Group>
        </UnstyledButton>
    );
};

export const ProtoTables: FC = () => {
    const { connections } = useProtoConnections();

    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const effectiveSearch = debouncedSearch.trim();
    const isFiltering = effectiveSearch.length > 0;

    const [overrides, setOverrides] = useState<Record<string, boolean>>(() =>
        defaultExpandedRowIds(connections),
    );

    const toggleRow = useCallback((rowId: string) => {
        setOverrides((previous) => ({
            ...previous,
            [rowId]: !previous[rowId],
        }));
    }, []);

    const visibleConnections = useMemo(
        () => filterConnectionsBySearch(connections, effectiveSearch),
        [connections, effectiveSearch],
    );

    const rows = useMemo(
        () =>
            buildConnectionTreeRows(visibleConnections, (rowId) =>
                isFiltering ? true : (overrides[rowId] ?? false),
            ),
        [visibleConnections, isFiltering, overrides],
    );

    return (
        <>
            <SwitchPrompt />

            <TextInput
                size="sm"
                mb="xs"
                flex="0 0 auto"
                leftSection={<MantineIcon icon={IconSearch} />}
                rightSectionPointerEvents="all"
                rightSection={
                    search.length > 0 ? (
                        <ActionIcon
                            aria-label="Clear search"
                            size="xs"
                            onClick={() => setSearch('')}
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    ) : null
                }
                placeholder="Search tables"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
            />

            <ScrollArea
                offsetScrollbars
                scrollbars="y"
                classNames={{ content: scrollAreaClasses.verticalContent }}
                flex={1}
                type="auto"
            >
                {rows.map((row) => (
                    <TreeRow
                        key={row.id}
                        row={row}
                        search={effectiveSearch}
                        onToggle={toggleRow}
                    />
                ))}
                {rows.length === 0 && (
                    <Text c="dimmed" fz="sm" ta="center" p="sm">
                        No results found
                    </Text>
                )}
            </ScrollArea>
        </>
    );
};
