import { type Dashboard } from '@lightdash/common';
import {
    Button,
    Group,
    Stack,
    TextInput,
    Textarea,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconLayoutDashboard } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import {
    useDashboardQuery,
    useUpdateDashboard,
} from '../../../hooks/dashboard/useDashboard';
import MantineModal from '../MantineModal';

interface DashboardUpdateModalProps {
    opened: ModalProps['opened'];
    onClose: ModalProps['onClose'];
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
        <MantineModal
            title="Update Dashboard"
            {...modalProps}
            icon={IconLayoutDashboard}
            actions={
                <Group position="right">
                    <Button variant="outline" onClick={modalProps.onClose}>
                        Cancel
                    </Button>

                    <Button
                        disabled={!form.isValid()}
                        loading={isUpdating}
                        type="submit"
                        form="update-dashboard"
                    >
                        Save
                    </Button>
                </Group>
            }
        >
            <form
                id="update-dashboard"
                title="Update Dashboard"
                onSubmit={handleConfirm}
            >
                <Stack spacing="lg">
                    <TextInput
                        label="Name"
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
                </Stack>
            </form>
        </MantineModal>
    );
};

export default DashboardUpdateModal;
