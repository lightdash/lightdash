import { PartitionType, type PartitionColumn } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Center,
    CopyButton,
    Group,
    Highlight,
    Loader,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
    type BoxProps,
} from '@mantine/core';
import { useDebouncedValue, useHover } from '@mantine/hooks';
import {
    IconChevronDown,
    IconChevronRight,
    IconCopy,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import Fuse from 'fuse.js';
import { isEmpty } from 'lodash';
import { memo, useEffect, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useIsTruncated } from '../../../hooks/useIsTruncated';
import { useTables, type TablesBySchema } from '../hooks/useTables';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSql, toggleActiveTable } from '../store/sqlRunnerSlice';

const limitTableResults = 100;

interface TableItemProps extends BoxProps {
    table: string;
    search: string;
    schema: string;
    database: string;
    isActive: boolean;
    partitionColumn: PartitionColumn | undefined;
}

const partitionFilter = (partitionColumn: PartitionColumn | undefined) => {
    if (partitionColumn) {
        const hint =
            partitionColumn.partitionType === PartitionType.DATE
                ? `This table has a date partition on this field`
                : `This table has a range partition on this field`;

        const defaultValue =
            partitionColumn.partitionType === PartitionType.DATE
                ? `'${dayjs().format('YYYY-MM-DD')}'` // Default to today's date
                : `0`;

        return `\nWHERE ${partitionColumn.field} = ${defaultValue} -- ${hint}`;
    }
    return '';
};

const TableItem: FC<TableItemProps> = memo(
    ({
        table,
        search,
        schema,
        database,
        isActive,
        partitionColumn,
        ...rest
    }) => {
        const { ref: hoverRef, hovered } = useHover();
        const { ref: truncatedRef, isTruncated } =
            useIsTruncated<HTMLDivElement>();
        const dispatch = useAppDispatch();
        const sql = useAppSelector((state) => state.sqlRunner.sql);
        const quoteChar = useAppSelector((state) => state.sqlRunner.quoteChar);
        const quotedTable = `${quoteChar}${database}${quoteChar}.${quoteChar}${schema}${quoteChar}.${quoteChar}${table}${quoteChar}`;
        return (
            <Box ref={hoverRef} pos="relative" {...rest}>
                <UnstyledButton
                    onClick={() => {
                        if (!sql || sql.match(/SELECT \* FROM (.+)/)) {
                            dispatch(
                                setSql(
                                    `SELECT * FROM ${quotedTable} ${partitionFilter(
                                        partitionColumn,
                                    )}`,
                                ),
                            );
                        }

                        dispatch(toggleActiveTable({ table, schema }));
                    }}
                    w="100%"
                    p={4}
                    sx={(theme) => ({
                        fontSize: 14,
                        borderRadius: theme.radius.sm,
                        color: isActive ? 'gray.8' : 'gray.7',
                        flex: 1,
                        background: isActive
                            ? theme.colors.gray[1]
                            : 'transparent',
                        '&:hover': {
                            background: isActive
                                ? theme.colors.gray[3]
                                : theme.colors.gray[2],
                        },
                    })}
                >
                    <Tooltip
                        withinPortal
                        variant="xs"
                        label={table}
                        disabled={!isTruncated}
                        multiline
                        maw={300}
                        sx={{
                            wordBreak: 'break-word',
                        }}
                    >
                        {search.length > 2 ? (
                            <Highlight
                                ref={truncatedRef}
                                component={Text}
                                highlight={search || ''}
                                truncate
                                sx={{
                                    flex: 1,
                                }}
                            >
                                {table}
                            </Highlight>
                        ) : (
                            <Text>{table}</Text>
                        )}
                    </Tooltip>
                </UnstyledButton>

                <Box
                    pos="absolute"
                    top={4}
                    right={8}
                    display={hovered ? 'block' : 'none'}
                >
                    <CopyButton value={`${quotedTable}`}>
                        {({ copied, copy }) => (
                            <Tooltip
                                variant="xs"
                                label={copied ? 'Copied to clipboard' : 'Copy'}
                                withArrow
                                position="right"
                            >
                                <ActionIcon
                                    size={16}
                                    onClick={copy}
                                    bg="gray.1"
                                >
                                    <MantineIcon
                                        icon={IconCopy}
                                        color={copied ? 'green' : 'blue'}
                                        onClick={copy}
                                    />
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </CopyButton>
                </Box>
            </Box>
        );
    },
);

const Table: FC<{
    schema: NonNullable<TablesBySchema>[number]['schema'];
    tables: NonNullable<TablesBySchema>[number]['tables'];
    search: string;
    activeTable: string | undefined;
    activeSchema: string | undefined;
    database: string;
}> = ({ schema, tables, search, activeTable, activeSchema, database }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const hasMatchingTable = useMemo(() => {
        if (!search || search.trim().length <= 2) return false;
        return Object.keys(tables).some(
            (table) =>
                table.toLowerCase().includes(search.toLowerCase()) ||
                schema.toString().toLowerCase().includes(search.toLowerCase()),
        );
    }, [tables, schema, search]);

    useEffect(() => {
        const isTableSelected =
            activeTable &&
            Object.keys(tables).includes(activeTable) &&
            schema === activeSchema;
        if (hasMatchingTable || isTableSelected) {
            setIsExpanded(true);
        } else {
            // Autoclose when search is empty and no matching table is selected
            // to avoid rendering all tables after a search

            // TODO fix this edge case
            // when this happens, there is still a render loop that is rendering all tables without search or filtering
            // which is making the UI unresponsive for a short while until this state is updated
            setIsExpanded(false);
        }
    }, [activeTable, tables, hasMatchingTable, activeSchema, schema]);
    return (
        <Stack spacing={0}>
            <UnstyledButton
                onClick={() => setIsExpanded(!isExpanded)}
                sx={(theme) => ({
                    borderRadius: theme.radius.md,
                    '&:hover': {
                        background: theme.colors.gray[1],
                    },
                })}
            >
                <Group noWrap spacing="two">
                    <Text p={6} fz="sm" c="gray.8">
                        {schema}
                    </Text>

                    <MantineIcon
                        icon={isExpanded ? IconChevronDown : IconChevronRight}
                    />
                </Group>
            </UnstyledButton>
            {isExpanded && (
                <>
                    {Object.keys(tables)
                        .slice(0, limitTableResults)
                        .map((table) => (
                            <TableItem
                                key={table}
                                search={search}
                                isActive={
                                    activeTable === table &&
                                    schema === activeSchema
                                }
                                table={table}
                                schema={`${schema}`}
                                database={database}
                                partitionColumn={tables[table].partitionColumn}
                                ml="sm"
                            />
                        ))}
                    {Object.keys(tables).length > limitTableResults && (
                        <Text ml="md" c="gray.5">
                            Filtering first {limitTableResults} of{' '}
                            {Object.keys(tables).length} tables, search to see
                            more
                        </Text>
                    )}
                </>
            )}
        </Stack>
    );
};

export const Tables: FC = () => {
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const activeTable = useAppSelector((state) => state.sqlRunner.activeTable);
    const activeSchema = useAppSelector(
        (state) => state.sqlRunner.activeSchema,
    );

    const [search, setSearch] = useState<string>('');
    const [debouncedSearch] = useDebouncedValue(search, 500);
    const isValidSearch = Boolean(
        debouncedSearch && debouncedSearch.trim().length > 2,
    );

    const { data, isLoading, isSuccess } = useTables({
        projectUuid,
    });

    const transformedData:
        | { database: string; tablesBySchema: TablesBySchema }
        | undefined = useMemo(() => {
        if (!data || isEmpty(data)) return undefined;
        const [database] = Object.keys(data);
        if (!database) return undefined;

        const tablesBySchema = Object.entries(data).flatMap(([, schemas]) =>
            Object.entries(schemas).map(([schema, tables]) => ({
                schema,
                tables,
            })),
        );
        return {
            database,
            tablesBySchema,
        };
    }, [data]);

    const filteredTablesBySchema:
        | { database: string; tablesBySchema: TablesBySchema }
        | undefined = useMemo(() => {
        if (
            !transformedData?.tablesBySchema ||
            !debouncedSearch ||
            !isValidSearch
        )
            return transformedData;

        const searchResults: TablesBySchema = transformedData.tablesBySchema
            .map((schemaData) => {
                const { schema, tables } = schemaData;
                const tableNames = Object.keys(tables);

                const fuse = new Fuse(tableNames, {
                    threshold: 0.3,
                    isCaseSensitive: false,
                });

                const fuseResult = fuse
                    .search(debouncedSearch)
                    .map((res) => res.item);

                return {
                    schema,
                    tables: fuseResult.reduce<typeof tables>(
                        (acc, tableName) => {
                            acc[tableName] = tables[tableName];
                            return acc;
                        },
                        {},
                    ),
                };
            })
            .filter((schemaData) => Object.keys(schemaData.tables).length > 0);
        if (searchResults.length === 0) {
            return undefined;
        } else
            return {
                database: transformedData.database,
                tablesBySchema: searchResults,
            };
    }, [isValidSearch, debouncedSearch, transformedData]);

    return (
        <>
            <Box px="sm">
                <Tooltip
                    opened={search.length > 0 && search.length < 3}
                    label="Enter at least 3 characters to search"
                    withinPortal
                >
                    <TextInput
                        size="xs"
                        disabled={!data && !debouncedSearch}
                        icon={
                            isLoading ? (
                                <Loader size="xs" />
                            ) : (
                                <MantineIcon icon={IconSearch} />
                            )
                        }
                        rightSection={
                            search ? (
                                <ActionIcon
                                    size="xs"
                                    onClick={() => setSearch('')}
                                >
                                    <MantineIcon icon={IconX} />
                                </ActionIcon>
                            ) : null
                        }
                        placeholder="Search tables"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        styles={(theme) => ({
                            input: {
                                borderRadius: theme.radius.md,
                                border: `1px solid ${theme.colors.gray[3]}`,
                            },
                        })}
                    />
                </Tooltip>
            </Box>

            <ScrollArea
                offsetScrollbars
                variant="primary"
                className="only-vertical"
                pl="sm"
                sx={{ flex: 1 }}
                type="auto"
                scrollbarSize={8}
            >
                {isSuccess &&
                    filteredTablesBySchema &&
                    filteredTablesBySchema.tablesBySchema?.map(
                        ({ schema, tables }) => (
                            <Table
                                key={schema}
                                schema={schema}
                                tables={tables}
                                search={isValidSearch ? debouncedSearch : ''}
                                activeTable={activeTable}
                                activeSchema={activeSchema}
                                database={filteredTablesBySchema?.database}
                            />
                        ),
                    )}
            </ScrollArea>

            {isSuccess && !data && (
                <Center p="sm">
                    <Text c="gray.4">No results found</Text>
                </Center>
            )}
        </>
    );
};
