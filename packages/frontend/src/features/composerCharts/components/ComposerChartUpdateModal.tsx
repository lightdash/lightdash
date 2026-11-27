import { type UpdateComposerChart } from '@lightdash/common';
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
    composerChartUuid: string;
    name: string;
    description: string | null;
    onConfirm: () => void;
};

export const ComposerChartUpdateModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    composerChartUuid,
    name,
    description,
    onConfirm,
}) => {
    const { mutateAsync, isLoading } = useUpdateComposerChart(
        projectUuid,
        composerChartUuid,
    );
    const form = useForm({
        initialValues: { name, description: description ?? '' },
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Name is required' : null,
        },
        validateInputOnChange: true,
    });

    // Send only fields edited since the modal opened, so others' edits are kept
    const handleConfirm = form.onSubmit(async (values) => {
        const patch: UpdateComposerChart = {
            ...(form.isDirty('name') ? { name: values.name.trim() } : {}),
            ...(form.isDirty('description')
                ? { description: values.description.trim() || null }
                : {}),
        };
        if (Object.keys(patch).length > 0) await mutateAsync(patch);
        onConfirm();
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
