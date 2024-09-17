import { snakeCaseName } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    Stack,
    Text,
    TextInput,
    type ModalProps,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconChartBar } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { z } from 'zod';
import MantineIcon from '../../../components/common/MantineIcon';
import { useCreateCustomExplore } from '../hooks/useCustomExplore';
import { useAppSelector } from '../store/hooks';

const validationSchema = z.object({
    name: z.string().min(1),
});

type FormValues = z.infer<typeof validationSchema>;

type Props = ModalProps;

export const SaveCustomExploreModal: FC<Props> = ({ opened, onClose }) => {
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const columns = useAppSelector((state) => state.sqlRunner.sqlColumns);
    const { mutateAsync: createCustomExplore, isLoading } =
        useCreateCustomExplore({
            projectUuid,
        });
    const form = useForm<FormValues>({
        initialValues: {
            name: '',
        },
        validate: zodResolver(validationSchema),
    });

    const handleSubmit = useCallback(
        async (data: { name: string }) => {
            if (!columns) {
                return;
            }

            await createCustomExplore({
                name: snakeCaseName(data.name),
                sql,
                columns,
                projectUuid,
            });
            onClose();
        },
        [createCustomExplore, sql, columns, onClose, projectUuid],
    );

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconChartBar} size="lg" color="gray.7" />
                    <Text fw={500}>Save custom explore</Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack p="md">
                    <Stack spacing="xs">
                        <TextInput
                            label="Custom explore name"
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
                        disabled={isLoading}
                    >
                        Cancel
                    </Button>

                    <Button
                        type="submit"
                        disabled={!form.values.name || !sql}
                        loading={isLoading}
                    >
                        Create Custom Explore
                    </Button>
                </Group>
            </form>
        </Modal>
    );
};
