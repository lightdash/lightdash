import { type SavedChart } from '@lightdash/common';
import {
    Button,
    Stack,
    TextInput,
    Textarea,
    type ModalProps,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconPencil } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { useSavedQuery, useUpdateMutation } from '../../../hooks/useSavedQuery';
import useSearchParams from '../../../hooks/useSearchParams';
import MantineModal from '../MantineModal';

interface ChartUpdateModalProps extends Pick<ModalProps, 'opened' | 'onClose'> {
    uuid: string;
    onConfirm?: () => void;
}

type FormState = Pick<SavedChart, 'name' | 'description'>;

const ChartUpdateModal: FC<ChartUpdateModalProps> = ({
    opened,
    onClose,
    uuid,
    onConfirm,
}) => {
    const dashboardUuid = useSearchParams('fromDashboard');
    const { data: chart, isInitialLoading } = useSavedQuery({ id: uuid });
    const { mutateAsync, isLoading: isUpdating } = useUpdateMutation(
        dashboardUuid ? dashboardUuid : undefined,
        uuid,
    );

    const form = useForm<FormState>({
        initialValues: {
            name: '',
            description: '',
        },
    });

    const { setValues } = form;

    useEffect(() => {
        if (!chart) return;
        setValues({
            name: chart.name,
            description: chart.description,
        });
    }, [chart, setValues]);

    if (isInitialLoading || !chart) {
        return null;
    }

    const handleConfirm = form.onSubmit(async (data) => {
        await mutateAsync({
            name: data.name,
            description: data.description,
        });
        onConfirm?.();
    });

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Update Chart"
            icon={IconPencil}
            actions={
                <Button
                    disabled={!form.isValid()}
                    loading={isUpdating}
                    type="submit"
                    form="update-chart-form"
                >
                    Save
                </Button>
            }
        >
            <form
                id="update-chart-form"
                title="Update Chart"
                onSubmit={handleConfirm}
            >
                <Stack>
                    <TextInput
                        label="Chart name"
                        required
                        placeholder="eg. How many weekly active users do we have?"
                        disabled={isUpdating}
                        {...form.getInputProps('name')}
                    />

                    <Textarea
                        label="Chart description"
                        placeholder="A few words to give your team some context"
                        disabled={isUpdating}
                        autosize
                        maxRows={3}
                        {...form.getInputProps('description')}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};

export default ChartUpdateModal;
