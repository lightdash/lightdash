import {
    ActionIcon,
    Center,
    Highlight,
    LoadingOverlay,
    Stack,
    Text,
    TextInput,
    UnstyledButton,
} from '@mantine/core';
import { IconSearch, IconX } from '@tabler/icons-react';
import { useState, type Dispatch, type FC, type SetStateAction } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTables } from '../hooks/useTables';

type Props = {
    projectUuid: string;
    activeTable: string | undefined;
    setActiveTable: Dispatch<SetStateAction<string | undefined>>;
};

export const Tables: FC<Props> = ({
    activeTable,
    setActiveTable,
    projectUuid,
}) => {
    const [search, setSearch] = useState<string>('');
    const isValidSearch = Boolean(search && search.trim().length > 2);
    const { data, isLoading } = useTables({
        projectUuid,
        search: isValidSearch ? search : undefined,
    });

    return (
        <>
            <LoadingOverlay visible={isLoading} />
            <TextInput
                size="xs"
                disabled={isLoading || (!data && !isValidSearch)}
                icon={<MantineIcon icon={IconSearch} />}
                rightSection={
                    search ? (
                        <ActionIcon onClick={() => setSearch('')}>
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
            {data ? (
                data.map(({ schema, tables }) => (
                    <Stack key={schema} spacing="none">
                        <Text p={6} fw={700} fz="md" c="gray.7">
                            {schema}
                        </Text>
                        {Object.keys(tables).map((table) => (
                            <UnstyledButton
                                key={table}
                                onClick={() => {
                                    setActiveTable(table);
                                }}
                                fw={500}
                                p={4}
                                fz={13}
                                c={activeTable === table ? 'gray.8' : 'gray.7'}
                                bg={
                                    activeTable === table
                                        ? 'gray.1'
                                        : 'transparent'
                                }
                                sx={(theme) => ({
                                    borderRadius: theme.radius.sm,
                                    '&:hover': {
                                        backgroundColor: theme.colors.gray[1],
                                    },
                                })}
                            >
                                <Highlight
                                    component={Text}
                                    highlight={search || ''}
                                >
                                    {table}
                                </Highlight>
                            </UnstyledButton>
                        ))}
                    </Stack>
                ))
            ) : (
                <Center p="sm">
                    <Text c="gray.4">No results found</Text>
                </Center>
            )}
        </>
    );
};
