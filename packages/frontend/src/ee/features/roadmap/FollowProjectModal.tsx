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
                <Callout
                    variant="info"
                    color="ldGray"
                    mt="sm"
                    px="sm"
                    py="xs"
                    radius="sm"
                    bg="ldGray.0"
                    styles={{
                        root: {
                            border: '1px solid var(--mantine-color-ldGray-2)',
                        },
                        icon: {
                            color: 'var(--mantine-color-ldGray-4)',
                            marginInlineEnd: 'var(--mantine-spacing-xs)',
                        },
                        message: {
                            color: 'var(--mantine-color-ldGray-7)',
                            fontSize: 'var(--mantine-font-size-xs)',
                        },
                    }}
                >
                    Your organization and user details, including your name and
                    email address, will be shared with the Lightdash team along
                    with your note.
                </Callout>
            </Box>
        </MantineModal>
    );
}
