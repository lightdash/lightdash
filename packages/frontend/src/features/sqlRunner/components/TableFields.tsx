import {
    Box,
    Center,
    Loader,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { memo, useCallback, useEffect, type FC } from 'react';
import { useTableFields } from '../hooks/useTableFields';
import { useSqlRunnerProvider } from '../providers/SqlRunnerProvider';

const TableField: FC<{ field: string; isActiveField: boolean }> = memo(
    ({ field, isActiveField }) => {
        console.log('TableField', field, 'rendered');

        const { setActiveFields } = useSqlRunnerProvider();

        return (
            <UnstyledButton
                fw={500}
                p={4}
                fz={13}
                c={isActiveField ? 'gray.8' : 'gray.7'}
                bg={isActiveField ? 'gray.1' : 'transparent'}
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
                        backgroundColor: theme.colors.gray[1],
                    },
                })}
            >
                {field}
            </UnstyledButton>
        );
    },
);

export const TableFields: FC = () => {
    const { activeTable, projectUuid, setActiveFields, activeFields } =
        useSqlRunnerProvider();
    const {
        data: tableFields,
        isLoading,
        isSuccess,
    } = useTableFields({
        projectUuid,
        tableName: activeTable,
    });

    useEffect(() => {
        if (isSuccess) {
            setActiveFields(undefined);
        }
    }, [isSuccess, setActiveFields]);

    const isActiveField = useCallback(
        (field: string) => {
            return Boolean(activeFields && activeFields.has(field));
        },
        [activeFields],
    );

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
                                <TableField
                                    key={field}
                                    field={field}
                                    isActiveField={isActiveField(field)}
                                />
                            ))}
                        </Stack>
                    </Box>
                </>
            )}
        </Stack>
    );
};
