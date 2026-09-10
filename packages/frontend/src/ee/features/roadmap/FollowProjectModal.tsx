import { RoadmapFollowProjectRequestSchema } from '@lightdash/common';
import { Box, Button, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
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
            title={`Follow "${projectTitle}"`}
            size="lg"
            onClose={() => {
                if (!isLoading) onClose();
            }}
            cancelDisabled={isLoading}
            withCloseButton={!isLoading}
            actions={
                <Button
                    color="indigo"
                    type="submit"
                    form="follow-roadmap-project-form"
                    loading={isLoading}
                    disabled={!form.isValid()}
                >
                    Send request
                </Button>
            }
        >
            <Box
                component="form"
                id="follow-roadmap-project-form"
                onSubmit={handleSubmit}
            >
                <Callout variant="info" mb="md">
                    Your organization and user details, including your name and
                    email address, will be shared with the Lightdash team along
                    with your note.
                </Callout>
                <Textarea
                    label="Why are you interested in this feature?"
                    placeholder="Tell us how your team would use it."
                    required
                    data-autofocus
                    autosize
                    minRows={4}
                    maxRows={8}
                    maxLength={2000}
                    disabled={isLoading}
                    {...form.getInputProps('note')}
                />
            </Box>
        </MantineModal>
    );
}
