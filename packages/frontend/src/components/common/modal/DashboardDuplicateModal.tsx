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
    useDuplicateDashboardMutation,
} from '../../../hooks/dashboard/useDashboard';

interface DashboardDuplicateModalProps extends ModalProps {
    uuid: string;
    onConfirm?: (dashboard: Dashboard) => void;
}

type FormState = Pick<Dashboard, 'name' | 'description'>;

const DashboardDuplicateModal: FC<DashboardDuplicateModalProps> = ({
    uuid,
    onConfirm,
    ...modalProps
}) => {
    const { mutateAsync: duplicateDashboard, isLoading: isUpdating } =
        useDuplicateDashboardMutation({
            showRedirectButton: true,
        });
    const { data: dashboard, isInitialLoading } = useDashboardQuery(uuid);

    const form = useForm<FormState>();

    useEffect(() => {
        if (!dashboard) return;

        const initialValues = {
            name: `Copy of ${dashboard.name}`,
            description: dashboard.description ?? '',
        };

        if (!form.initialized) {
            form.initialize(initialValues);
        } else {
            form.setInitialValues(initialValues);
            form.setValues(initialValues);
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dashboard]);

    const handleConfirm = form.onSubmit(async (data) => {
        const updatedDashboard = await duplicateDashboard({
            uuid: uuid,
            name: data.name,
            description: data.description,
        });

        onConfirm?.(updatedDashboard);
    });

    const isLoading =
        isInitialLoading || !dashboard || !form.initialized || isUpdating;

    return (
        <Modal
            title={<Title order={4}>Duplicate Dashboard</Title>}
            {...modalProps}
        >
            <form title="Duplicate Dashboard" onSubmit={handleConfirm}>
                <Stack spacing="lg" pt="sm">
                    <TextInput
                        label="Enter a memorable name for your dashboard"
                        required
                        placeholder="eg. KPI Dashboards"
                        disabled={isLoading}
                        {...form.getInputProps('name')}
                        value={form.values.name ?? ''}
                    />

                    <Textarea
                        label="Description"
                        placeholder="A few words to give your team some context"
                        disabled={isLoading}
                        autosize
                        maxRows={3}
                        {...form.getInputProps('description')}
                        value={form.values.description ?? ''}
                    />

                    <Group position="right" mt="sm">
                        <Button variant="outline" onClick={modalProps.onClose}>
                            Cancel
                        </Button>

                        <Button
                            disabled={!form.isValid()}
                            loading={isLoading}
                            type="submit"
                        >
                            Create duplicate
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};

export default DashboardDuplicateModal;
