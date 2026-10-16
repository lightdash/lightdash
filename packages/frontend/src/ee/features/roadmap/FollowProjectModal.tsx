import { RoadmapFollowProjectRequestSchema } from '@lightdash/common';
import { Box, Button, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { useTranslation } from 'react-i18next';
import Callout from '../../../components/common/Callout';
import MantineModal from '../../../components/common/MantineModal';

export function FollowProjectModal({
    projectTitle,
    isLoading,
    onSubmit,
    onClose,
}: {
    projectTitle: string;
    isLoading: boolean;
    onSubmit: (note: string) => Promise<boolean>;
    onClose: () => void;
}) {
    const { t } = useTranslation('eeMisc');
    const form = useForm({
        initialValues: { note: '' },
        validate: zodResolver(RoadmapFollowProjectRequestSchema),
    });
    const handleSubmit = form.onSubmit(async ({ note }) => {
        if (isLoading) return;
        if (await onSubmit(note.trim())) onClose();
    });

    return (
        <MantineModal
            opened
            title={t('roadmap.follow.modalTitle', { title: projectTitle })}
            size="lg"
            onClose={() => {
                if (!isLoading) onClose();
            }}
            cancelDisabled={isLoading}
            withCloseButton={!isLoading}
            actions={
                <Button
                    type="submit"
                    form="follow-roadmap-project-form"
                    loading={isLoading}
                    disabled={!form.isValid()}
                >
                    {t('roadmap.follow.sendRequest')}
                </Button>
            }
        >
            <Box
                component="form"
                id="follow-roadmap-project-form"
                onSubmit={handleSubmit}
            >
                <Textarea
                    label={t('roadmap.follow.noteLabel')}
                    placeholder={t('roadmap.follow.notePlaceholder')}
                    required
                    data-autofocus
                    autosize
                    minRows={4}
                    maxRows={8}
                    maxLength={2000}
                    disabled={isLoading}
                    {...form.getInputProps('note')}
                />
                <Callout variant="neutral" mt="sm" px="sm" py="xs">
                    {t('roadmap.follow.privacyNote')}
                </Callout>
            </Box>
        </MantineModal>
    );
}
