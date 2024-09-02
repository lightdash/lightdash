import { type SavedChart } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    Stack,
    Textarea,
    TextInput,
    Title,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, type FC } from 'react';
import { useSavedQuery, useUpdateMutation } from '../../../hooks/useSavedQuery';
import useSearchParams from '../../../hooks/useSearchParams';

interface ChartUpdateModalProps extends ModalProps {
    uuid: string;
    onConfirm?: () => void;
}

type FormState = Pick<SavedChart, 'name' | 'description'>;

const ChartUpdateModal: FC<ChartUpdateModalProps> = ({
    uuid,
    onConfirm,
    ...modalProps
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
        <Modal title={<Title order={4}>Update Chart</Title>} {...modalProps}>
            <form title="Update Chart" onSubmit={handleConfirm}>
                <Stack spacing="lg" pt="sm">
                    <TextInput
                        label="Chart Name"
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

                    <Group position="right" mt="sm">
                        <Button variant="outline" onClick={modalProps.onClose}>
                            Cancel
                        </Button>

                        <Button
                            disabled={!form.isValid()}
                            loading={isUpdating}
                            type="submit"
                        >
                            Save
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};

export default ChartUpdateModal;
