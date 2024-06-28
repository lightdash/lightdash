import { Stack, UnstyledButton } from '@mantine/core';
import { type Dispatch, type FC, type SetStateAction } from 'react';

type Props = {
    tables: string[];
    activeTable: string | undefined;
    setActiveTable: Dispatch<SetStateAction<string | undefined>>;
};

export const TablesList: FC<Props> = ({
    tables,
    activeTable,
    setActiveTable,
}) => {
    return (
        <Stack spacing="none">
            {tables.map((table) => (
                <UnstyledButton
                    key={table}
                    onClick={() => {
                        setActiveTable(table);
                    }}
                    fw={500}
                    p={6}
                    fz="sm"
                    c={activeTable === table ? 'gray.8' : 'gray.7'}
                    bg={activeTable === table ? 'gray.1' : 'transparent'}
                    sx={(theme) => ({
                        borderRadius: theme.radius.sm,
                        '&:hover': {
                            backgroundColor: theme.colors.gray[1],
                        },
                    })}
                >
                    {table}
                </UnstyledButton>
            ))}
        </Stack>
    );
};
