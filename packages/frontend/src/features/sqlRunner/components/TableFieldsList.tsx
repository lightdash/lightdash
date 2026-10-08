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
import { useHover } from '@mantine/hooks';
import { IconSearch, IconX } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import { CopyActionIcon } from '../../../components/common/CopyActionIcon';
import MantineIcon from '../../../components/common/MantineIcon';
import { useIsTruncated } from '../../../hooks/useIsTruncated';
import scrollAreaClasses from '../../../styles/ScrollArea.module.css';
import { type WarehouseTableField } from '../hooks/useTableFields';
import styles from './TableFieldsList.module.css';

const FieldRow: FC<{
    table: string;
    field: WarehouseTableField;
    search: string;
}> = memo(({ table, field, search }) => {
    const { ref: hoverRef, hovered } = useHover();
    const { ref: truncatedRef, isTruncated } = useIsTruncated<HTMLDivElement>();
    return (
        <Group
            ref={hoverRef}
            gap="xs"
            wrap="nowrap"
            className={styles.row}
            data-hovered={hovered || undefined}
        >
            <Tooltip label={field.name} disabled={!isTruncated} openDelay={400}>
                <Text ref={truncatedRef} ff="monospace" fz="xs" truncate>
                    <Highlight component="span" highlight={search} inherit>
                        {field.name}
                    </Highlight>
                </Text>
            </Tooltip>
            {hovered ? (
                <CopyActionIcon
                    value={`${table}.${field.name}`}
                    copyLabel="Copy column"
                    copiedLabel="Copied to clipboard"
                    tooltipPosition="right"
                    size="xs"
                    ml="auto"
                />
            ) : (
                <Text ff="monospace" fz="xs" c="ldGray.5" ml="auto">
                    {field.type}
                </Text>
            )}
        </Group>
    );
});

type Props = {
    // Everything before the table name, already joined with dots
    pathPrefix: string | null;
    table: string;
    copyValue: string;
    fields: WarehouseTableField[];
    isLoading: boolean;
    isReady: boolean;
    search: string;
    onSearchChange: (search: string) => void;
    // The filter actually applied to `fields`; empty while the input is too short
    highlight: string;
};

export const TableFieldsList: FC<Props> = ({
    pathPrefix,
    table,
    copyValue,
    fields,
    isLoading,
    isReady,
    search,
    onSearchChange,
    highlight,
}) => (
    <Stack gap={0} h="100%" className={styles.root}>
        <Group gap={0} wrap="nowrap" className={styles.header}>
            {pathPrefix && (
                <Text
                    ff="monospace"
                    fz="xs"
                    c="ldGray.5"
                    className={styles.pathPrefix}
                >
                    {pathPrefix}
                </Text>
            )}
            {pathPrefix && (
                <Text ff="monospace" fz="xs" c="ldGray.5" flex="0 0 auto">
                    .
                </Text>
            )}
            <Text ff="monospace" fz="xs" fw={500} truncate>
                {table}
            </Text>
            <CopyActionIcon
                value={copyValue}
                copyLabel="Copy full table path"
                copiedLabel="Copied to clipboard"
                tooltipPosition="left"
                ml="auto"
            />
        </Group>
        <Box px="xs" pb="xs">
            <TextInput
                size="xs"
                disabled={!isReady}
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
                            onMouseDown={(event) => event.preventDefault()}
                            size="xs"
                            onClick={() => onSearchChange('')}
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    ) : null
                }
                placeholder="Search fields"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
            />
        </Box>
        {isReady && fields.length > 0 && (
            <ScrollArea
                offsetScrollbars
                scrollbars="y"
                classNames={{ content: scrollAreaClasses.verticalContent }}
                flex={1}
                type="auto"
                scrollbarSize={8}
                pl="xs"
            >
                <Stack gap={0}>
                    {fields.map((field) => (
                        <FieldRow
                            key={field.name}
                            table={table}
                            field={field}
                            search={highlight}
                        />
                    ))}
                </Stack>
            </ScrollArea>
        )}
        {isReady && fields.length === 0 && (
            <Center p="sm">
                <Text c="dimmed" fz="sm">
                    No columns found
                </Text>
            </Center>
        )}
    </Stack>
);
