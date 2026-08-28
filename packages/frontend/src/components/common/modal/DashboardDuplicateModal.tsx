import { type Dashboard } from '@lightdash/common';
import {
    Button,
    Stack,
    Textarea,
    TextInput,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconCopy } from '@tabler/icons-react';
import { type FC } from 'react';
import {
    useDashboardQuery,
    useDuplicateDashboardMutation,
} from '../../../hooks/dashboard/useDashboard';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import MantineModal from '../MantineModal';

interface DashboardDuplicateModalProps extends ModalProps {
    uuid: string;
    onConfirm?: (dashboard: Dashboard) => void;
}

type FormState = Pick<Dashboard, 'name' | 'description'>;

const DashboardDuplicateForm: FC<
    DashboardDuplicateModalProps & {
        dashboard: Dashboard | null;
        isInitialLoading: boolean;
    }
> = ({ uuid, dashboard, isInitialLoading, onConfirm, opened, onClose }) => {
    const { mutateAsync: duplicateDashboard, isLoading: isUpdating } =
        useDuplicateDashboardMutation({
            showRedirectButton: true,
        });

    const form = useForm<FormState>({
        initialValues: {
            name: dashboard ? `Copy of ${dashboard.name}` : '',
            description: dashboard?.description ?? '',
        },
    });

    const handleConfirm = form.onSubmit(async (data) => {
        const updatedDashboard = await duplicateDashboard({
            uuid: uuid,
            name: data.name,
            description: data.description,
        });

        onConfirm?.(updatedDashboard);
    });

    const isLoading = isInitialLoading || !dashboard || isUpdating;

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Duplicate Dashboard"
            icon={IconCopy}
            actions={
                <Button
                    disabled={!form.isValid() || !dashboard}
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

const DashboardDuplicateModal: FC<DashboardDuplicateModalProps> = (props) => {
    const projectUuid = useProjectUuid();
    const { data: dashboard, isInitialLoading } = useDashboardQuery({
        uuidOrSlug: props.uuid,
        projectUuid,
    });

    return (
        <DashboardDuplicateForm
            key={dashboard?.uuid ?? 'loading'}
            dashboard={dashboard ?? null}
            isInitialLoading={isInitialLoading}
            {...props}
        />
    );
};

export default DashboardDuplicateModal;
