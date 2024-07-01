import {
    Box,
    Center,
    Loader,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { memo, useCallback, type FC } from 'react';
import { setActiveFields } from '../../../store/features/sqlRunner/sqlRunnerSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { useTableFields } from '../hooks/useTableFields';
import { useSqlRunnerProvider } from '../providers/SqlRunnerProvider';

const TableField: FC<{ field: string; isActiveField: boolean }> = memo(
    ({ field, isActiveField }) => {
        console.log('rendered TableField', field);

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
    const activeTable = useAppSelector((state) => state.sqlRunner.activeTable);
    const { projectUuid } = useSqlRunnerProvider();
    const { data: tableFields, isLoading } = useTableFields({
        projectUuid,
        tableName: activeTable,
    });

    const activeFields = useAppSelector(
        (state) => state.sqlRunner.activeFields,
    );

    const isActiveField = useCallback(
        (field: string) => {
            return Boolean(activeFields && activeFields.includes(field));
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
