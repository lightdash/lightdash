import {
    ActionIcon,
    Box,
    Center,
    Group,
    Highlight,
    Loader,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useDebouncedValue, useHover } from '@mantine/hooks';
import { IconSearch, IconX } from '@tabler/icons-react';
import Fuse from 'fuse.js';
import { memo, useMemo, useState, type FC } from 'react';
import { CopyActionIcon } from '../../../../components/common/CopyActionIcon';
import MantineIcon from '../../../../components/common/MantineIcon';
import { TableFieldIcon } from '../../../../components/DataViz/Icons';
import { useIsTruncated } from '../../../../hooks/useIsTruncated';
import scrollAreaClasses from '../../../../styles/ScrollArea.module.css';
import { type WarehouseTableField } from '../../hooks/useTableFields';
import { useActiveConnection } from '../hooks/useActiveConnection';
import { useConnectionTableFields } from '../hooks/useConnectionCatalog';

const MIN_SEARCH_LENGTH = 3;

const TableField: FC<{
    activeTable: string;
    field: WarehouseTableField;
    search: string | undefined;
}> = memo(({ activeTable, field, search }) => {
    const { ref: hoverRef, hovered } = useHover();
    const { ref: truncatedRef, isTruncated } = useIsTruncated<HTMLDivElement>();
    return (
        <Group gap="xs" wrap="nowrap" ref={hoverRef}>
            {hovered ? (
                <CopyActionIcon
                    value={`${activeTable}.${field.name}`}
                    copiedLabel="Copied to clipboard"
                    tooltipPosition="right"
                    size={16}
                    bg="ldGray.1"
                />
            ) : (
                <TableFieldIcon fieldType={field.type} />
            )}
            <Tooltip label={field.name} disabled={!isTruncated}>
                <Text
                    ref={truncatedRef}
                    fw={500}
                    p={4}
                    fz="sm"
                    c="ldGray.7"
                    flex={1}
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
            <Text fz="xs" c="ldGray.5">
                {field.type}
            </Text>
        </Group>
    );
});

export const MultiConnectionTableFields: FC = () => {
    const { projectUuid, activeTable } = useActiveConnection();

    const [search, setSearch] = useState<string>('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const effectiveSearch =
        debouncedSearch.trim().length >= MIN_SEARCH_LENGTH
            ? debouncedSearch
            : '';

    const { data, isInitialLoading, isSuccess } = useConnectionTableFields({
        projectUuid,
        identity: activeTable,
    });

    const fields = useMemo<WarehouseTableField[]>(
        () =>
            Object.entries(data ?? {})
                .map(([name, type]) => ({ name, type }))
                .filter((field) => field.name.trim() !== ''),
        [data],
    );

    const visibleFields = useMemo(() => {
        if (!effectiveSearch) return fields;
        const fuse = new Fuse(fields, {
            threshold: 0.3,
            isCaseSensitive: false,
            ignoreLocation: true,
            keys: ['name'],
        });
        return fuse.search(effectiveSearch).map((result) => result.item);
    }, [fields, effectiveSearch]);

    if (!activeTable) {
        return (
            <Center p="md">
                <Text c="ldGray.4">No table selected</Text>
            </Center>
        );
    }

    return (
        <Stack gap="xs" h="100%" pt="sm">
            <Box px="sm">
                <Text fz="sm" fw={600} c="ldGray.7">
                    {activeTable.table}
                </Text>
                <TextInput
                    size="xs"
                    radius="md"
                    disabled={!isSuccess}
                    leftSection={
                        isInitialLoading ? (
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
                                onMouseDown={(event) => event.preventDefault()}
                                size="xs"
                                onClick={() => setSearch('')}
                            >
                                <MantineIcon icon={IconX} />
                            </ActionIcon>
                        ) : null
                    }
                    placeholder="Search fields"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
            </Box>
            {isSuccess && visibleFields.length > 0 && (
                <ScrollArea
                    offsetScrollbars
                    scrollbars="y"
                    classNames={{ content: scrollAreaClasses.verticalContent }}
                    flex={1}
                    type="auto"
                    scrollbarSize={8}
                    pl="sm"
                >
                    <Stack gap={0}>
                        {visibleFields.map((field) => (
                            <TableField
                                key={field.name}
                                activeTable={activeTable.table}
                                field={field}
                                search={search}
                            />
                        ))}
                    </Stack>
                </ScrollArea>
            )}
            {isSuccess && visibleFields.length === 0 && (
                <Center p="sm">
                    <Text c="ldGray.4">No results found</Text>
                </Center>
            )}
        </Stack>
    );
};
