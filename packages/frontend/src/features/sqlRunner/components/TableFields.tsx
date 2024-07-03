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
import { useEffect, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTableFields } from '../hooks/useTableFields';

type Props = {
    projectUuid: string;
    activeTable: string | undefined;
};

export const TableFields: FC<Props> = ({ projectUuid, activeTable }) => {
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
    const [activeFields, setActiveFields] = useState<Set<string> | undefined>();

    useEffect(() => {
        if (isSuccess) {
            setActiveFields(undefined);
        }
    }, [isSuccess]);

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
                        sx={{
                            overflowY: 'scroll',
                            flexGrow: 1,
                        }}
                    >
                        <Stack spacing={0}>
                            {tableFields.map((field) => (
                                <UnstyledButton
                                    key={field}
                                    fw={500}
                                    p={4}
                                    fz={13}
                                    c={
                                        activeFields && activeFields.has(field)
                                            ? 'gray.8'
                                            : 'gray.7'
                                    }
                                    bg={
                                        activeFields && activeFields.has(field)
                                            ? 'gray.1'
                                            : 'transparent'
                                    }
                                    onClick={() => {
                                        setActiveFields((prev) => {
                                            const newSet = new Set(prev);
                                            if (newSet.has(field)) {
                                                newSet.delete(field);
                                            } else {
                                                newSet.add(field);
                                            }
                                            return newSet;
                                        });
                                    }}
                                    sx={(theme) => ({
                                        borderRadius: theme.radius.sm,
                                        '&:hover': {
                                            backgroundColor:
                                                theme.colors.gray[1],
                                        },
                                    })}
                                >
                                    <Highlight
                                        component={Text}
                                        highlight={search || ''}
                                    >
                                        {field}
                                    </Highlight>
                                </UnstyledButton>
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
