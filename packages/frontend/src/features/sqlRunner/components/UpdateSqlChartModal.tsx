import {
    Button,
    Group,
    Modal,
    Stack,
    Text,
    Textarea,
    TextInput,
    type ModalProps,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconChartBar } from '@tabler/icons-react';
import { useEffect } from 'react';
import { z } from 'zod';
import MantineIcon from '../../../components/common/MantineIcon';
import SaveToSpaceForm, {
    saveToSpaceSchema,
} from '../../../components/common/modal/ChartCreateModal/SaveToSpaceForm';

import {
    useCreateMutation as useSpaceCreateMutation,
    useSpaceSummaries,
} from '../../../hooks/useSpaces';
import {
    useSavedSqlChart,
    useUpdateSqlChartMutation,
} from '../hooks/useSavedSqlCharts';

const updateSqlChartSchema = z
    .object({
        name: z.string().min(1),
        description: z.string().nullable(),
    })
    .merge(saveToSpaceSchema);

type FormValues = z.infer<typeof updateSqlChartSchema>;

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
    savedSqlUuid: string;
    slug: string;
    onSuccess: () => void;
};

export const UpdateSqlChartModal = ({
    projectUuid,
    savedSqlUuid,
    slug,
    opened,
    onClose,
    onSuccess,
}: Props) => {
    const {
        data,
        isLoading: isChartLoading,
        isSuccess: isChartSuccess,
    } = useSavedSqlChart({
        projectUuid,
        uuid: savedSqlUuid,
    });

    const { data: spaces = [], isLoading: isSpacesLoading } = useSpaceSummaries(
        projectUuid,
        true,
    );
    const { mutateAsync: createSpace, isLoading: isCreatingSpace } =
        useSpaceCreateMutation(projectUuid);

    const { mutateAsync: updateChart, isLoading: isSavingChart } =
        useUpdateSqlChartMutation(projectUuid, savedSqlUuid, slug);

    const form = useForm<FormValues>({
        initialValues: {
            name: '',
            description: null,
            spaceUuid: null,
            newSpaceName: null,
        },
        validate: zodResolver(updateSqlChartSchema),
    });

    useEffect(() => {
        if (isChartSuccess && data) {
            const values = {
                name: data.name,
                description: data.description,
                spaceUuid: data.space.uuid,
                newSpaceName: null,
            };

            form.setValues(values);
            form.resetDirty(values);
        }
        // form can't be a dependency because it will cause infinite loop
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, isChartSuccess]);

    const handleOnSubmit = form.onSubmit(
        async ({ name, description, spaceUuid, newSpaceName }) => {
            let newSpace = newSpaceName
                ? await createSpace({
                      name: newSpaceName,
                      access: [],
                      isPrivate: true,
                  })
                : undefined;

            await updateChart({
                unversionedData: {
                    name,
                    description: description ?? null,
                    spaceUuid: newSpace?.uuid || spaceUuid || spaces[0].uuid,
                },
            });

            onSuccess();
        },
    );

    const isLoading =
        isSavingChart || isChartLoading || isSpacesLoading || isCreatingSpace;

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconChartBar} size="lg" color="gray.7" />
                    <Text fw={500}>Update chart</Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <form onSubmit={handleOnSubmit}>
                <Stack p="md">
                    <Stack spacing="xs">
                        <TextInput
                            label="Chart name"
                            placeholder="eg. How many weekly active users do we have?"
                            required
                            {...form.getInputProps('name')}
                        />
                        <Textarea
                            label="Description"
                            {...form.getInputProps('description')}
                        />
                    </Stack>

                    <SaveToSpaceForm
                        form={form}
                        spaces={spaces}
                        projectUuid={projectUuid}
                        isLoading={isLoading}
                    />
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
                        disabled={!form.values.name}
                        loading={isLoading}
                    >
                        Save
                    </Button>
                </Group>
            </form>
        </Modal>
    );
};
