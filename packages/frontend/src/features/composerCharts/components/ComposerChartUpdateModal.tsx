import {
    Button,
    Stack,
    Textarea,
    TextInput,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPencil } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { useUpdateComposerChart } from '../hooks/useUpdateComposerChart';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
    uuid: string;
    name: string;
    description: string | null;
    onConfirm?: () => void;
};

/** Renames a space-owned composer chart; no new version, the slug unchanged. */
export const ComposerChartUpdateModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    uuid,
    name,
    description,
    onConfirm,
}) => {
    const { mutateAsync, isLoading } = useUpdateComposerChart(
        projectUuid,
        uuid,
    );
    const form = useForm({
        initialValues: { name, description: description ?? '' },
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Name is required' : null,
        },
        validateInputOnChange: true,
    });

    const handleConfirm = form.onSubmit(async (values) => {
        await mutateAsync({
            name: values.name.trim(),
            description: values.description.trim() || null,
        });
        onConfirm?.();
    });

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Update chart"
            icon={IconPencil}
            actions={
                <Button
                    disabled={!form.isValid()}
                    loading={isLoading}
                    type="submit"
                    form="update-composer-chart"
                >
                    Save
                </Button>
            }
        >
            <form id="update-composer-chart" onSubmit={handleConfirm}>
                <Stack>
                    <TextInput
                        label="Chart name"
                        required
                        data-autofocus
                        disabled={isLoading}
                        {...form.getInputProps('name')}
                    />
                    <Textarea
                        label="Chart description"
                        placeholder="A few words to give your team some context"
                        disabled={isLoading}
                        autosize
                        maxRows={3}
                        {...form.getInputProps('description')}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};
