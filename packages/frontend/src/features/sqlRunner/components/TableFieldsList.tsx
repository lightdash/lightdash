import {
    Box,
    Center,
    Stack,
    Text,
    TextInput,
    UnstyledButton,
} from '@mantine/core';
import { useMemo, type Dispatch, type FC, type SetStateAction } from 'react';
import { getTableFields } from '../mock';

type Props = {
    activeTable: string | undefined;
    activeFields: Set<string> | undefined;
    setActiveFields: Dispatch<SetStateAction<Set<string> | undefined>>;
};

export const TableFieldsList: FC<Props> = ({
    activeTable,
    activeFields,
    setActiveFields,
}) => {
    // TODO: remove mock data
    const tableFields: Record<string, string> | undefined = useMemo(() => {
        if (!activeTable) return undefined;
        return getTableFields(activeTable) as Record<string, string>;
    }, [activeTable]);

    if (!tableFields)
        return (
            <Center p="md">
                <Text c="gray.4">No table selected</Text>
            </Center>
        );
    return (
        <Stack pt="sm" spacing="xs" h="100%">
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
                        <TextInput
                            size="xs"
                            type="search"
                            placeholder="Search"
                        />
                        <Stack spacing={0}>
                            {Object.keys(tableFields).map((field) => (
                                <UnstyledButton
                                    key={field}
                                    fw={500}
                                    p={6}
                                    fz="sm"
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
