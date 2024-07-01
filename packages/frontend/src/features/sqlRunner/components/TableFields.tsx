import {
    Box,
    Center,
    Loader,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { useEffect, useState, type FC } from 'react';
import { useTableFields } from '../hooks/useTableFields';

type Props = {
    projectUuid: string;
    activeTable: string | undefined;
};

export const TableFields: FC<Props> = ({ projectUuid, activeTable }) => {
    const {
        data: tableFields,
        isLoading,
        isSuccess,
    } = useTableFields({
        projectUuid,
        tableName: activeTable,
    });
    const [activeFields, setActiveFields] = useState<Set<string> | undefined>();

    useEffect(() => {
        if (isSuccess) {
            setActiveFields(undefined);
        }
    }, [isSuccess]);

    return (
        <Stack pt="sm" spacing="xs" h="calc(100% - 20px)" py="xs">
            {isLoading && !!activeTable && <Loader size="xs" />}
            {(!activeTable || (!tableFields && !isLoading)) && (
                <Center p="md">
                    <Text c="gray.4">No table selected</Text>
                </Center>
            )}

            {tableFields && (
                <>
                    <Text fz="sm" fw={600} c="gray.7">
                        {activeTable}
                    </Text>
                    <Box
                        h="100%"
                        sx={{
                            overflowY: 'auto',
                        }}
                    >
                        <Stack spacing={0}>
                            {Object.keys(tableFields).map((field) => (
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
                                    {field}
                                </UnstyledButton>
                            ))}
                        </Stack>
                    </Box>
                </>
            )}
        </Stack>
    );
};
