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
import { useEffect, type FC } from 'react';
import { useTranslation } from 'react-i18next';
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

const DashboardDuplicateModal: FC<DashboardDuplicateModalProps> = ({
    opened,
    onClose,
    uuid,
    onConfirm,
}) => {
    const { t } = useTranslation('modals');
    const projectUuid = useProjectUuid();
    const { mutateAsync: duplicateDashboard, isLoading: isUpdating } =
        useDuplicateDashboardMutation({
            showRedirectButton: true,
        });
    const { data: dashboard, isInitialLoading } = useDashboardQuery({
        uuidOrSlug: uuid,
        projectUuid,
    });

    const form = useForm<FormState>();

    useEffect(() => {
        if (!dashboard) return;

        const initialValues = {
            name: t('duplicate.copyOf', { name: dashboard.name }),
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
            title={t('dashboardDuplicate.title')}
            icon={IconCopy}
            actions={
                <Button
                    disabled={!form.isValid()}
                    loading={isLoading}
                    type="submit"
                    form="duplicate-dashboard-form"
                >
                    {t('duplicate.createDuplicate')}
                </Button>
            }
        >
            <form
                id="duplicate-dashboard-form"
                title={t('dashboardDuplicate.title')}
                onSubmit={handleConfirm}
            >
                <Stack>
                    <TextInput
                        label={t('dashboardForm.nameLabel')}
                        required
                        placeholder={t('dashboardForm.namePlaceholder')}
                        disabled={isLoading}
                        {...form.getInputProps('name')}
                        value={form.values.name ?? ''}
                    />

                    <Textarea
                        label={t('dashboardForm.descriptionLabel')}
                        placeholder={t('descriptionPlaceholder')}
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
