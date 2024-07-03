import {
    ActionIcon,
    Box,
    Center,
    Highlight,
    Loader,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch, IconX } from '@tabler/icons-react';
import { memo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTableFields } from '../hooks/useTableFields';
import { useAppSelector } from '../store/hooks';

type Props = {
    projectUuid: string;
};

const TableField: FC<{
    field: string;
    search: string | undefined;
}> = memo(({ field, search }) => (
    <Box
        fw={500}
        p={4}
        fz={13}
        c="gray.7"
        sx={(theme) => ({
            borderRadius: theme.radius.sm,
        })}
    >
        <Highlight component={Text} highlight={search || ''}>
            {field}
        </Highlight>
    </Box>
));

export const TableFields: FC<Props> = ({ projectUuid }) => {
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
            {isSuccess && tableFields && (
                <>
                    <Box
                        h="100%"
                        sx={{
                            overflowY: 'auto',
                        }}
                    >
                        <Stack spacing={0}>
                            {tableFields.map((field) => (
                                <TableField
                                    key={field}
                                    field={field}
                                    search={search}
                                />
                            ))}
                        </Stack>
                    </Box>
                </>
            )}
            {isSuccess && !tableFields && (
                <Center p="sm">
                    <Text c="gray.4">No results found</Text>
                </Center>
            )}
        </Stack>
    );
};
