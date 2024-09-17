import { snakeCaseName } from '@lightdash/common';
import {
    Accordion,
    Button,
    Group,
    Modal,
    Stack,
    Text,
    TextInput,
    type ModalProps,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconInfoCircle, IconSparkles } from '@tabler/icons-react';
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
                    <MantineIcon icon={IconSparkles} size="lg" color="gray.7" />
                    <Text fw={500}>Create custom explore</Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Accordion variant="separated" radius="md" m="xs">
                    <Accordion.Item value="custom-explores">
                        <Accordion.Control
                            icon={
                                <MantineIcon icon={IconInfoCircle} size={16} />
                            }
                        >
                            <Text fz="sm" fw="500">
                                What are custom explores?
                            </Text>
                        </Accordion.Control>
                        <Accordion.Panel>
                            <Text fz="xs">
                                Custom explores are a way to save a query that
                                you can reuse later when 'Querying from tables'.
                                You can use them to save time when you and your
                                organization want to run the same query again.
                            </Text>
                        </Accordion.Panel>
                    </Accordion.Item>
                </Accordion>
                <Stack p="md">
                    <Stack spacing="xs">
                        <TextInput
                            radius="md"
                            label="Name"
                            required
                            {...form.getInputProps('name')}
                        />
                    </Stack>
                </Stack>

                <Group position="right" w="100%" p="md">
                    <Button
                        color="gray.7"
                        onClick={onClose}
                        variant="outline"
                        disabled={isLoading}
                        size="xs"
                    >
                        Cancel
                    </Button>

                    <Button
                        type="submit"
                        disabled={!form.values.name || !sql}
                        loading={isLoading}
                        size="xs"
                    >
                        Create
                    </Button>
                </Group>
            </form>
        </Modal>
    );
};
