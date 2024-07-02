import { LoadingOverlay, Stack, Text, UnstyledButton } from '@mantine/core';
import { type Dispatch, type FC, type SetStateAction } from 'react';
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
    const { data, isLoading } = useTables({ projectUuid });

    return (
        <>
            <LoadingOverlay visible={isLoading} />
            {data &&
                Object.entries(data).map(([, schemas]) =>
                    Object.entries(schemas).map(([schema, tables]) => (
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
                                    c={
                                        activeTable === table
                                            ? 'gray.8'
                                            : 'gray.7'
                                    }
                                    bg={
                                        activeTable === table
                                            ? 'gray.1'
                                            : 'transparent'
                                    }
                                    sx={(theme) => ({
                                        borderRadius: theme.radius.sm,
                                        '&:hover': {
                                            backgroundColor:
                                                theme.colors.gray[1],
                                        },
                                    })}
                                >
                                    {table}
                                </UnstyledButton>
                            ))}
                        </Stack>
                    )),
                )}
        </>
    );
};
