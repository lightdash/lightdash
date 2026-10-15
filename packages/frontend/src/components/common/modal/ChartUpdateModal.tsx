import { type SavedChart } from '@lightdash/common';
import {
    Button,
    Stack,
    Textarea,
    TextInput,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPencil } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
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
    const { t } = useTranslation('modals');
    const projectUuid = useProjectUuid();
    const dashboardUuid = useSearchParams('fromDashboard');
    const { data: chart, isInitialLoading } = useSavedQuery({
        uuidOrSlug: uuid,
        projectUuid,
    });
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
            title={t('chartUpdate.title')}
            icon={IconPencil}
            actions={
                <Button
                    disabled={!form.isValid()}
                    loading={isUpdating}
                    type="submit"
                    form="update-chart-form"
                >
                    {t('actions.save', { ns: 'common' })}
                </Button>
            }
        >
            <form
                id="update-chart-form"
                title={t('chartUpdate.title')}
                onSubmit={handleConfirm}
            >
                <Stack>
                    <TextInput
                        label={t('chartForm.nameLabel')}
                        required
                        placeholder={t('chartForm.namePlaceholder')}
                        disabled={isUpdating}
                        {...form.getInputProps('name')}
                    />

                    <Textarea
                        label={t('chartForm.descriptionLabel')}
                        placeholder={t('descriptionPlaceholder')}
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
