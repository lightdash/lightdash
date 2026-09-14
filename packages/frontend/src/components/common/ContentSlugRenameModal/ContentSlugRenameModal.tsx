import {
    ContentType,
    generateSlug,
    type ApiError,
    type ApiSuccessEmpty,
    type ContentSlugRenameRequest,
} from '@lightdash/common';
import { Button, Paper, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconLink } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { type FC } from 'react';
import { z } from 'zod';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { invalidateContent } from '../../../hooks/useContent';
import MantineModal from '../MantineModal';
import classes from './ContentSlugRenameModal.module.css';

type Props = {
    opened: boolean;
    onClose: () => void;
    onRenamed: (slug: string) => void;
    projectUuid: string;
    projectUrlIdentifier: string;
    currentSlug: string;
    resourceType: ContentType.CHART | ContentType.DASHBOARD;
};

const ContentSlugRenameModal: FC<Props> = ({
    opened,
    onClose,
    onRenamed,
    projectUuid,
    projectUrlIdentifier,
    currentSlug,
    resourceType,
}) => {
    const queryClient = useQueryClient();
    const resourceLabel =
        resourceType === ContentType.CHART ? 'Chart' : 'Dashboard';
    const formId = `${resourceType}-slug-rename-form`;
    const { showToastSuccess } = useToaster();
    const form = useForm({
        initialValues: { slug: currentSlug },
        validate: zodResolver(
            z.object({
                slug: z
                    .string()
                    .trim()
                    .min(1, 'Enter a slug')
                    .max(255, 'Slugs must be 255 characters or fewer')
                    .refine(
                        (value) => generateSlug(value) === value,
                        'Use lowercase letters, numbers, and hyphens only',
                    )
                    .refine(
                        (value) => value !== currentSlug,
                        'Enter a different slug',
                    ),
            }),
        ),
    });

    const renameMutation = useMutation<
        ApiSuccessEmpty['results'],
        ApiError,
        ContentSlugRenameRequest
    >(
        (body) =>
            lightdashApi<ApiSuccessEmpty['results']>({
                url: `/projects/${projectUuid}/slugs/rename`,
                method: 'POST',
                body: JSON.stringify(body),
            }),
        {
            onSuccess: async (_, { to }) => {
                await Promise.all([
                    invalidateContent(queryClient, projectUuid),
                    queryClient.invalidateQueries([
                        resourceType === ContentType.CHART
                            ? 'saved_query'
                            : 'saved_dashboard_query',
                    ]),
                ]);
                showToastSuccess({
                    title: `${resourceLabel} URL slug changed`,
                });
                onRenamed(to);
            },
            onError: ({ error }) => {
                form.setFieldError('slug', error.message);
            },
        },
    );

    const newSlug = form.values.slug.trim();
    const contentPath =
        resourceType === ContentType.CHART
            ? `saved/${newSlug}/view`
            : `dashboards/${newSlug}`;
    const newUrl = `${window.location.origin}/projects/${projectUrlIdentifier}/${contentPath}`;

    const handleSubmit = form.onSubmit(({ slug }) => {
        renameMutation.mutate({
            resourceType,
            from: currentSlug,
            to: slug.trim(),
        });
    });

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Change URL slug"
            icon={IconLink}
            size="lg"
            cancelDisabled={renameMutation.isLoading}
            actions={
                <Button
                    type="submit"
                    form={formId}
                    loading={renameMutation.isLoading}
                    disabled={!form.isDirty()}
                >
                    Change slug
                </Button>
            }
        >
            <form id={formId} onSubmit={handleSubmit}>
                <Stack gap="md">
                    <Text size="sm" c="dimmed">
                        Change the last part of this {resourceType}&apos;s URL.
                        Existing links will keep working.
                    </Text>
                    <TextInput
                        label="New slug"
                        description="Lowercase letters, numbers, and hyphens"
                        data-autofocus
                        maxLength={255}
                        disabled={renameMutation.isLoading}
                        onFocus={(event) => event.currentTarget.select()}
                        {...form.getInputProps('slug')}
                    />
                    <Stack gap="xs">
                        <Text size="sm" fw={500}>
                            URL preview
                        </Text>
                        <Paper withBorder p="sm">
                            <Text
                                component="code"
                                size="xs"
                                className={classes.urlPreview}
                            >
                                {newUrl}
                            </Text>
                        </Paper>
                    </Stack>
                </Stack>
            </form>
        </MantineModal>
    );
};

export default ContentSlugRenameModal;
