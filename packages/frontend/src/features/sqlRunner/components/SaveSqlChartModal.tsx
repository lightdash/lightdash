import { ChartKind } from '@lightdash/common';
import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconChartBar } from '@tabler/icons-react';
import { useCallback, useEffect, type FC } from 'react';
import { z } from 'zod';
import MantineIcon from '../../../components/common/MantineIcon';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import { useCreateSqlChartMutation } from '../hooks/useSavedSqlCharts';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { updateName } from '../store/sqlRunnerSlice';

const validationSchema = z.object({
    name: z.string().min(1),
});

type FormValues = z.infer<typeof validationSchema>;

type Props = {
    isOpen: boolean;
    onClose: () => void;
};

export const SaveSqlChartModal: FC<Props> = ({ isOpen, onClose }) => {
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const { data: spaces = [] } = useSpaceSummaries(projectUuid, true);

    const name = useAppSelector((state) => state.sqlRunner.name);

    const form = useForm<FormValues>({
        initialValues: {
            name: '',
        },
        validate: zodResolver(validationSchema),
    });

    useEffect(() => {
        if (!form.values.name && name) {
            form.setFieldValue('name', name);
        }
    }, [name, form]);

    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const config = useAppSelector((state) =>
        state.sqlRunner.selectedChartType === ChartKind.TABLE
            ? state.sqlRunner.tableChartConfig
            : state.sqlRunner.barChartConfig,
    );

    const {
        mutateAsync: createSavedSqlChart,
        isLoading: isCreatingSavedSqlChart,
        isSuccess: isSavedSqlChartCreated,
    } = useCreateSqlChartMutation(projectUuid);

    useEffect(() => {
        if (isSavedSqlChartCreated) {
            onClose();
        }
    }, [isSavedSqlChartCreated, onClose]);

    const handleOnSubmit = useCallback(async () => {
        if (spaces.length === 0) {
            return;
        }
        await createSavedSqlChart({
            name: form.values.name,
            description: 'A test saved chart',
            sql: sql,
            config: config || {},
            // TODO: add space selection
            spaceUuid: spaces[0].uuid,
        });
        dispatch(updateName(form.values.name));
        onClose();
    }, [
        config,
        createSavedSqlChart,
        dispatch,
        form.values.name,
        onClose,
        spaces,
        sql,
    ]);

    return (
        <Modal
            opened={isOpen}
            onClose={onClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconChartBar} size="lg" color="gray.7" />
                    <Text fw={500}>Save chart</Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <form onSubmit={form.onSubmit(handleOnSubmit)}>
                <Stack p="md">
                    <Stack spacing="xs">
                        <TextInput
                            label="Enter a memorable name for your chart"
                            placeholder="eg. How many weekly active users do we have?"
                            required
                            {...form.getInputProps('name')}
                        />
                    </Stack>
                </Stack>

                <Group
                    position="right"
                    w="100%"
                    sx={(theme) => ({
                        borderTop: `1px solid ${theme.colors.gray[4]}`,
                        bottom: 0,
                        padding: theme.spacing.md,
                    })}
                >
                    <Button
                        onClick={onClose}
                        variant="outline"
                        disabled={isCreatingSavedSqlChart}
                    >
                        Cancel
                    </Button>

                    <Button
                        type="submit"
                        disabled={!form.values.name}
                        loading={isCreatingSavedSqlChart}
                    >
                        Save
                    </Button>
                </Group>
            </form>
        </Modal>
    );
};
