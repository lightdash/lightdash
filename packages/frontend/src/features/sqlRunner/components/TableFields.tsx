import {
    ActionIcon,
    Box,
    Center,
    Highlight,
    Loader,
    Stack,
    Text,
    TextInput,
    UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch, IconX } from '@tabler/icons-react';
import { memo, useCallback, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { setActiveFields } from '../../../store/features/sqlRunner/sqlRunnerSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { useTableFields } from '../hooks/useTableFields';

type Props = {
    projectUuid: string;
};

const TableField: FC<{
    field: string;
    isActiveField: boolean;
    search: string | undefined;
}> = memo(({ field, isActiveField, search }) => {
    const dispatch = useAppDispatch();

    return (
        <UnstyledButton
            fw={500}
            p={4}
            fz={13}
            c={isActiveField ? 'gray.8' : 'gray.7'}
            bg={isActiveField ? 'gray.1' : 'transparent'}
            onClick={() => {
                dispatch(setActiveFields(field));
            }}
            sx={(theme) => ({
                borderRadius: theme.radius.sm,
                '&:hover': {
                    backgroundColor: theme.colors.gray[isActiveField ? 3 : 1],
                },
            })}
        >
            <Highlight component={Text} highlight={search || ''}>
                {field}
            </Highlight>
        </UnstyledButton>
    );
});

export const TableFields: FC<Props> = ({ projectUuid }) => {
    const activeTable = useAppSelector((state) => state.sqlRunner.activeTable);
    const activeFields = useAppSelector(
        (state) => state.sqlRunner.activeFields,
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
        search: isValidSearch ? debouncedSearch : undefined,
    });

    const isActiveField = useCallback(
        (field: string) =>
            Boolean(activeFields && activeFields.includes(field)),
        [activeFields],
    );

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
                                    isActiveField={isActiveField(field)}
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
