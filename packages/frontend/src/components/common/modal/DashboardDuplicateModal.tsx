import { type Dashboard } from '@lightdash/common';
import {
    Button,
    Stack,
    TextInput,
    Textarea,
    type ModalProps,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconCopy } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import {
    useDashboardQuery,
    useDuplicateDashboardMutation,
} from '../../../hooks/dashboard/useDashboard';
import MantineModal from '../MantineModal';

interface DashboardDuplicateModalProps extends ModalProps {
    uuid: string;
    onConfirm?: (dashboard: Dashboard) => void;
}

type FormState = Pick<Dashboard, 'name' | 'description'>;

const DashboardDuplicateModal: FC<DashboardDuplicateModalProps> = ({
    opened,
    onClose,
    uuid,
    onConfirm,
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
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Duplicate Dashboard"
            icon={IconCopy}
            actions={
                <Button
                    disabled={!form.isValid()}
                    loading={isLoading}
                    type="submit"
                    form="duplicate-dashboard-form"
                >
                    Create duplicate
                </Button>
            }
        >
            <form
                id="duplicate-dashboard-form"
                title="Duplicate Dashboard"
                onSubmit={handleConfirm}
            >
                <Stack>
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
                </Stack>
            </form>
        </MantineModal>
    );
};

export default DashboardDuplicateModal;
