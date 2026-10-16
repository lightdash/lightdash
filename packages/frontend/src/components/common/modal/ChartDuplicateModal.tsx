import { type SavedChart } from '@lightdash/common';
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
import { useContentAuthoringEnabled } from '../../../hooks/useContentAuthoringEnabled';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import {
    useDuplicateChartMutation,
    useSavedQuery,
} from '../../../hooks/useSavedQuery';
import MantineModal from '../MantineModal';

interface ChartDuplicateModalProps extends ModalProps {
    uuid: string;
    onConfirm?: (savedChart: SavedChart) => void;
}

type FormState = Pick<SavedChart, 'name' | 'description'>;

const ChartDuplicateModal: FC<ChartDuplicateModalProps> = ({
    uuid,
    onConfirm,
    ...modalProps
}) => {
    const { t } = useTranslation('modals');
    const authoringEnabled = useContentAuthoringEnabled();
    const projectUuid = useProjectUuid();
    const { mutateAsync: duplicateChart, isLoading: isUpdating } =
        useDuplicateChartMutation({
            showRedirectButton: true,
        });
    const { data: savedQuery, isInitialLoading } = useSavedQuery({
        uuidOrSlug: uuid,
        projectUuid,
    });

    const form = useForm<FormState>();

    useEffect(() => {
        if (!savedQuery) return;

        const initialValues = {
            name: t('duplicate.copyOf', { name: savedQuery.name }),
            description: savedQuery.description,
        };

        if (!form.initialized) {
            form.initialize(initialValues);
        } else {
            form.setInitialValues(initialValues);
            form.setValues(initialValues);
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [savedQuery]);

    const isLoading =
        isInitialLoading || !savedQuery || !form.initialized || isUpdating;

    const handleConfirm = form.onSubmit(async (data) => {
        const updatedChart = await duplicateChart({
            uuid: uuid,
            name: data.name,
            description: data.description,
        });

        onConfirm?.(updatedChart);
    });

    if (!authoringEnabled) return null;

    return (
        <MantineModal
            opened={modalProps.opened}
            onClose={modalProps.onClose}
            title={t('chartDuplicate.title')}
            icon={IconCopy}
            actions={
                <Button
                    disabled={!form.isValid()}
                    loading={isLoading}
                    type="submit"
                    form="duplicate-chart-form"
                >
                    {t('duplicate.createDuplicate')}
                </Button>
            }
        >
            <form
                id="duplicate-chart-form"
                title={t('chartDuplicate.title')}
                onSubmit={handleConfirm}
            >
                <Stack>
                    <TextInput
                        label={t('chartForm.nameLabel')}
                        required
                        placeholder={t('chartForm.namePlaceholder')}
                        disabled={isLoading}
                        {...form.getInputProps('name')}
                        value={form.values.name ?? ''}
                    />

                    <Textarea
                        label={t('chartForm.descriptionLabel')}
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

export default ChartDuplicateModal;
