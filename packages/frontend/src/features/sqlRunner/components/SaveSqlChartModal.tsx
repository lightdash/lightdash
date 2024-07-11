import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconChartBar } from '@tabler/icons-react';
import { z } from 'zod';
import MantineIcon from '../../../components/common/MantineIcon';
import { useCreateSqlChartMutation } from '../hooks/useSavedSqlCharts';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { toggleModal } from '../store/sqlRunnerSlice';

const validationSchema = z.object({
    name: z.string().min(1),
});

type FormValues = z.infer<typeof validationSchema>;

export const SaveSqlChartModal = () => {
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const isOpen = useAppSelector(
        (state) => state.sqlRunner.modals.saveChartModal.isOpen,
    );

    const {
        mutateAsync: createSavedSqlChart,
        isLoading: isCreatingSavedSqlChart,
    } = useCreateSqlChartMutation(projectUuid);

    const onClose = () => dispatch(toggleModal('saveChartModal'));

    const form = useForm<FormValues>({
        initialValues: {
            name: '',
        },
        validate: zodResolver(validationSchema),
    });

    const handleOnSubmit = async () => {
        await createSavedSqlChart({
            name: 'bah',
            description: 'moo',
            sql: 'SELECT * from farm',
            config: {},
            spaceUuid: '56e5546b-9c8e-48ce-95fe-700325a0364e',
        });
    };

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
