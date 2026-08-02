import {
    TextInput,
    Box,
    Center,
    CopyButton,
    Group,
    Loader,
    Stack,
    Text,
    ActionIcon,
    Highlight,
    ScrollArea,
    Tooltip,
} from '@mantine-8/core';
import { useDebouncedValue, useHover } from '@mantine-8/hooks';
import { IconCopy, IconSearch, IconX } from '@tabler/icons-react';
import { memo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { TableFieldIcon } from '../../../components/DataViz/Icons';
import { useIsTruncated } from '../../../hooks/useIsTruncated';
import scrollAreaClasses from '../../../styles/ScrollArea.module.css';
import {
    useTableFields,
    type WarehouseTableField,
} from '../hooks/useTableFields';
import { useAppSelector } from '../store/hooks';

const TableField: FC<{
    activeTable: string;
    field: WarehouseTableField;
    search: string | undefined;
}> = memo(({ activeTable, field, search }) => {
    const { ref: hoverRef, hovered } = useHover();
    const { ref: truncatedRef, isTruncated } = useIsTruncated<HTMLDivElement>();
    return (
        <Group gap={'xs'} wrap="nowrap" ref={hoverRef}>
            {hovered ? (
                <Box display={hovered ? 'block' : 'none'}>
                    <CopyButton value={`${activeTable}.${field.name}`}>
                        {({ copied, copy }) => (
                            <Tooltip
                                label={copied ? 'Copied to clipboard' : 'Copy'}
                                withArrow
                                position="right"
                            >
                                <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    size={16}
                                    onClick={copy}
                                    bg="ldGray.1"
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
            ) : (
                <TableFieldIcon fieldType={field.type} />
            )}

            <Tooltip withinPortal label={field.name} disabled={!isTruncated}>
                <Text
                    ref={truncatedRef}
                    fw={500}
                    p={4}
                    fz={13}
                    c="ldGray.7"
                    style={{ flex: 1 }}
                    truncate
                >
                    <Highlight
                        component="span"
                        highlight={search || ''}
                        inherit
                    >
                        {field.name}
                    </Highlight>
                </Text>
            </Tooltip>
            <Text fz={12} c="ldGray.5">
                {field.type}
            </Text>
        </Group>
    );
});

export const TableFields: FC = () => {
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const activeTable = useAppSelector((state) => state.sqlRunner.activeTable);
    const activeSchema = useAppSelector(
        (state) => state.sqlRunner.activeSchema,
    );

    const [search, setSearch] = useState<string>('');
    const [debouncedSearch] = useDebouncedValue(search, 300);

    const isValidSearch = Boolean(
        debouncedSearch && debouncedSearch.trim().length > 2,
    );

    const {
        data: tableFields,
        isLoading,
        isSuccess,
    } = useTableFields({
        projectUuid,
        tableName: activeTable,
        schema: activeSchema,
        search: isValidSearch ? debouncedSearch : undefined,
    });

    return (
        <Stack gap="xs" h="100%" pt="sm">
            {activeTable ? (
                <Box px="sm">
                    <Text fz="sm" fw={600} c="ldGray.7">
                        {activeTable}
                    </Text>
                    <TextInput
                        size="xs"
                        disabled={!tableFields && !isValidSearch}
                        leftSection={
                            isLoading ? (
                                <Loader size="xs" />
                            ) : (
                                <MantineIcon icon={IconSearch} />
                            )
                        }
                        rightSectionPointerEvents="all"
                        rightSection={
                            search ? (
                                <ActionIcon
                                    aria-label="Clear search"
                                    onMouseDown={(event) =>
                                        event.preventDefault()
                                    }
                                    variant="subtle"
                                    color="gray"
                                    size="xs"
                                    onClick={() => setSearch('')}
                                >
                                    <MantineIcon icon={IconX} />
                                </ActionIcon>
                            ) : null
                        }
                        placeholder="Search fields"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        styles={(theme) => ({
                            input: {
                                borderRadius: theme.radius.md,
                                border: `1px solid ${theme.colors.ldGray[3]}`,
                            },
                        })}
                    />
                </Box>
            ) : (
                <Center p="md">
                    <Text c="ldGray.4">No table selected</Text>
                </Center>
            )}
            {isSuccess && tableFields && activeTable && (
                <ScrollArea
                    offsetScrollbars
                    scrollbars="y"
                    classNames={{ content: scrollAreaClasses.verticalContent }}
                    style={{ flex: 1 }}
                    type="auto"
                    scrollbarSize={8}
                    pl="sm"
                >
                    <Stack gap={0}>
                        {tableFields.map((field) => (
                            <TableField
                                key={field.name}
                                activeTable={activeTable}
                                field={field}
                                search={search}
                            />
                        ))}
                    </Stack>
                </ScrollArea>
            )}
            {isSuccess && !tableFields && (
                <Center p="sm">
                    <Text c="ldGray.4">No results found</Text>
                </Center>
            )}
        </Stack>
    );
};
