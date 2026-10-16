import { type ApiDuplicateAppResponse } from '@lightdash/common';
import { Button, Stack, TextInput, type ModalProps } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconGitFork } from '@tabler/icons-react';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import MantineModal from '../../../components/common/MantineModal';
import useToaster from '../../../hooks/toaster/useToaster';
import i18n from '../../../i18n/i18n';
import { useDuplicateApp } from '../../apps/hooks/useDuplicateApp';

type Props = {
    opened: ModalProps['opened'];
    onClose: ModalProps['onClose'];
    projectUuid: string;
    appUuid: string;
    defaultName: string;
    onForked: (result: ApiDuplicateAppResponse['results']) => void;
};

const forkSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, {
            error: () => i18n.t('fork.nameRequired', { ns: 'chartTypes' }),
        }),
});

type FormState = z.infer<typeof forkSchema>;

/** Forks an official (registry-installed) chart type into an editable copy. */
const ChartTypeForkModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    appUuid,
    defaultName,
    onForked,
}) => {
    const { t } = useTranslation('chartTypes');
    const { showToastSuccess } = useToaster();
    const { mutate: duplicate, isLoading: isForking } = useDuplicateApp();

    const form = useForm<FormState>({
        initialValues: { name: defaultName },
        validate: zodResolver(forkSchema),
        validateInputOnChange: true,
    });

    const handleSubmit = form.onSubmit((data) => {
        duplicate(
            { projectUuid, appUuid, name: data.name.trim() },
            {
                onSuccess: (result) => {
                    showToastSuccess({ title: t('fork.forkedToast') });
                    onForked(result);
                },
            },
        );
    });

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('detail.forkToCustomize')}
            icon={IconGitFork}
            description={t('fork.description')}
            actions={
                <Button
                    disabled={!form.isValid()}
                    loading={isForking}
                    type="submit"
                    form="fork-chart-type"
                >
                    {t('fork.fork')}
                </Button>
            }
        >
            <form id="fork-chart-type" onSubmit={handleSubmit}>
                <Stack>
                    <TextInput
                        label={t('fork.name')}
                        required
                        placeholder={t('fork.namePlaceholder')}
                        disabled={isForking}
                        {...form.getInputProps('name')}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};

export default ChartTypeForkModal;
