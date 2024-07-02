import { LoadingOverlay, Stack, Text, UnstyledButton } from '@mantine/core';
import { type FC } from 'react';
import { setActiveTable } from '../../../store/features/sqlRunner/sqlRunnerSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { useTables } from '../hooks/useTables';

type Props = {
    projectUuid: string;
};

export const Tables: FC<Props> = ({ projectUuid }) => {
    const activeTable = useAppSelector((state) => state.sqlRunner.activeTable);
    const dispatch = useAppDispatch();

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
                                        dispatch(setActiveTable(table));
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
