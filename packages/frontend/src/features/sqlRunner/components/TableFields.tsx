import { type DimensionType } from '@lightdash/common';
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
} from '@mantine/core';
import { useDebouncedValue, useHover } from '@mantine/hooks';
import {
    Icon123,
    IconAbc,
    IconCalendar,
    IconClockHour4,
    IconCopy,
    IconQuestionMark,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import { memo, useMemo, useState, type FC } from 'react';
import { getItemIconName } from '../../../components/common/Filters/FieldIcon';
import MantineIcon from '../../../components/common/MantineIcon';
import { useIsTruncated } from '../../../hooks/useIsTruncated';
import {
    useTableFields,
    type WarehouseTableField,
} from '../hooks/useTableFields';
import { useAppSelector } from '../store/hooks';

export const TableFieldIcon: FC<{
    fieldType: DimensionType;
}> = memo(({ fieldType }) => {
    const Icon = useMemo(() => {
        switch (getItemIconName(fieldType)) {
            case 'citation':
                return IconAbc;
            case 'numerical':
                return Icon123;
            case 'calendar':
                return IconCalendar;
            case 'time':
                return IconClockHour4;
            default:
                return IconQuestionMark;
        }
    }, [fieldType]);

    return <MantineIcon icon={Icon} color="gray.5" />;
});

const TableField: FC<{
    activeTable: string;
    field: WarehouseTableField;
    search: string | undefined;
}> = memo(({ activeTable, field, search }) => {
    const { ref: hoverRef, hovered } = useHover();
    const { ref: truncatedRef, isTruncated } = useIsTruncated<HTMLDivElement>();
    return (
        <Group spacing={'xs'} noWrap ref={hoverRef}>
            {hovered ? (
                <Box display={hovered ? 'block' : 'none'}>
                    <CopyButton value={`${activeTable}.${field.name}`}>
                        {({ copied, copy }) => (
                            <ActionIcon size={16} onClick={copy} bg="gray.1">
                                <MantineIcon
                                    icon={IconCopy}
                                    color={copied ? 'green' : 'blue'}
                                    onClick={copy}
                                />
                            </ActionIcon>
                        )}
                    </CopyButton>
                </Box>
            ) : (
                <TableFieldIcon fieldType={field.type} />
            )}

            <Tooltip
                withinPortal
                variant="xs"
                label={field.name}
                disabled={!isTruncated}
            >
                <Highlight
                    ref={truncatedRef}
                    component={Text}
                    fw={500}
                    p={4}
                    fz={13}
                    c="gray.7"
                    sx={{
                        flex: 1,
                    }}
                    highlight={search || ''}
                    truncate
                >
                    {field.name}
                </Highlight>
            </Tooltip>
            <Text fz={12} c="gray.5">
                {field.type}
            </Text>
        </Group>
    );
});

export const TableFields: FC = () => {
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const activeTable = useAppSelector((state) => state.sqlRunner.activeTable);

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
        search: isValidSearch ? debouncedSearch : undefined,
    });

    return (
        <Stack pt="sm" spacing="xs" h="calc(100% - 20px)" py="xs">
            {activeTable ? (
                <>
                    <Text fz="sm" fw={600} c="gray.7">
                        {activeTable}
                    </Text>
                    <TextInput
                        size="xs"
                        disabled={!tableFields && !isValidSearch}
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
                        placeholder="Search fields"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        styles={(theme) => ({
                            input: {
                                borderRadius: theme.radius.md,
                                border: `1px solid ${theme.colors.gray[3]}`,
                            },
                        })}
                    />
                </>
            ) : (
                <Center p="md">
                    <Text c="gray.4">No table selected</Text>
                </Center>
            )}
            {isSuccess && tableFields && activeTable && (
                <ScrollArea
                    offsetScrollbars
                    variant="primary"
                    className="only-vertical"
                    sx={{ flex: 1 }}
                    type="auto"
                >
                    <Stack spacing={0}>
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
                    <Text c="gray.4">No results found</Text>
                </Center>
            )}
        </Stack>
    );
};
