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
import { memo, useEffect, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useIsTruncated } from '../../../hooks/useIsTruncated';
import { useTables, type TablesBySchema } from '../hooks/useTables';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSql, toggleActiveTable } from '../store/sqlRunnerSlice';

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
        if (
            activeTable &&
            Object.keys(tables).includes(activeTable) &&
            schema === activeSchema
        ) {
            setIsExpanded(true);
        }
        if (hasMatchingTable) {
            setIsExpanded(true);
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
            {isExpanded &&
                Object.keys(tables).map((table) => (
                    <TableItem
                        key={table}
                        search={search}
                        isActive={
                            activeTable === table && schema === activeSchema
                        }
                        table={table}
                        schema={`${schema}`}
                        database={database}
                        partitionColumn={tables[table].partitionColumn}
                        ml="sm"
                    />
                ))}
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
        search: isValidSearch ? debouncedSearch : undefined,
    });

    return (
        <>
            <Box px="sm">
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
                            <ActionIcon size="xs" onClick={() => setSearch('')}>
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
                    data &&
                    data.tablesBySchema?.map(({ schema, tables }) => (
                        <Table
                            key={schema}
                            schema={schema}
                            tables={tables}
                            search={search}
                            activeTable={activeTable}
                            activeSchema={activeSchema}
                            database={data.database}
                        />
                    ))}
            </ScrollArea>

            {isSuccess && !data && (
                <Center p="sm">
                    <Text c="gray.4">No results found</Text>
                </Center>
            )}
        </>
    );
};
