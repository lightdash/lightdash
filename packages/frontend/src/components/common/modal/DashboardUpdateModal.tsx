import { type Dashboard } from '@lightdash/common';
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
import {
    useDashboardQuery,
    useUpdateDashboard,
} from '../../../hooks/dashboard/useDashboard';

interface DashboardUpdateModalProps extends ModalProps {
    uuid: string;
    onConfirm?: () => void;
}

type FormState = Pick<Dashboard, 'name' | 'description'>;

const DashboardUpdateModal: FC<DashboardUpdateModalProps> = ({
    uuid,
    onConfirm,
    ...modalProps
}) => {
    const { data: dashboard, isInitialLoading } = useDashboardQuery(uuid);
    const { mutateAsync, isLoading: isUpdating } = useUpdateDashboard(uuid);

    const form = useForm<FormState>({
        initialValues: {
            name: '',
            description: '',
        },
    });

    const { setValues } = form;

    useEffect(() => {
        if (!dashboard) return;

        setValues({
            name: dashboard.name,
            description: dashboard.description ?? '',
        });
    }, [dashboard, setValues]);

    if (isInitialLoading || !dashboard) {
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
        <Modal
            title={<Title order={4}>Update Dashboard</Title>}
            {...modalProps}
        >
            <form title="Update Dashboard" onSubmit={handleConfirm}>
                <Stack spacing="lg" pt="sm">
                    <TextInput
                        label="Enter a memorable name for your dashboard"
                        required
                        placeholder="eg. KPI Dashboards"
                        disabled={isUpdating}
                        {...form.getInputProps('name')}
                    />

                    <Textarea
                        label="Description"
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

export default DashboardUpdateModal;
