import {
    ContentType,
    ResourceViewItemType,
    type ContentReviewContentType,
} from '@lightdash/common';
import { Button, LoadingOverlay, Stack, Text, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconSend } from '@tabler/icons-react';
import { useMemo, type FC, type ReactNode } from 'react';
import MantineModal from '../../../../components/common/MantineModal';
import SpaceSelector from '../../../../components/common/SpaceSelector/SpaceSelector';
import {
    usePersonalSpace,
    useSpaceSummaries,
} from '../../../../hooks/useSpaces';
import { useCreateContentReviewRequest } from '../hooks/useContentReviewRequests';

type Props = {
    projectUuid: string;
    contentType: ContentReviewContentType;
    contentUuid: string;
    contentName: string;
    opened: boolean;
    onClose: () => void;
    // Slot for the similar-content nudge
    aside?: ReactNode;
};

const RequestReviewModal: FC<Props> = ({
    projectUuid,
    contentType,
    contentUuid,
    contentName,
    opened,
    onClose,
    aside,
}) => {
    const { data: personalSpace } = usePersonalSpace(projectUuid, {
        enabled: opened,
    });
    const { data: spaces = [], isInitialLoading: isLoadingSpaces } =
        useSpaceSummaries(projectUuid, true, { enabled: opened });
    const targetSpaces = useMemo(
        () => spaces.filter((space) => space.uuid !== personalSpace?.uuid),
        [personalSpace?.uuid, spaces],
    );
    const { mutateAsync: createRequest, isLoading: isSubmitting } =
        useCreateContentReviewRequest(projectUuid);

    const form = useForm<{ targetSpaceUuid: string | null; note: string }>({
        initialValues: { targetSpaceUuid: null, note: '' },
    });

    const handleClose = () => {
        form.reset();
        onClose();
    };

    const handleSubmit = form.onSubmit(async (values) => {
        if (values.targetSpaceUuid === null) return;
        await createRequest({
            contentType,
            contentUuid,
            targetSpaceUuid: values.targetSpaceUuid,
            note: values.note.trim().length > 0 ? values.note.trim() : null,
            similarContent: [],
        });
        handleClose();
    });

    const typeLabel = contentType === ContentType.CHART ? 'chart' : 'dashboard';

    return (
        <MantineModal
            title="Request review"
            opened={opened}
            onClose={handleClose}
            icon={IconSend}
            size="xl"
            actions={
                <Button
                    type="submit"
                    form="request-review-form"
                    loading={isSubmitting}
                    disabled={form.values.targetSpaceUuid === null}
                >
                    Request review
                </Button>
            }
        >
            <form id="request-review-form" onSubmit={handleSubmit}>
                <LoadingOverlay visible={isLoadingSpaces} />
                <Stack gap="md">
                    <Text fz="sm">
                        Pick the shared space this {typeLabel} belongs in. The
                        people who can edit that space will review{' '}
                        <Text component="span" fw={600}>
                            "{contentName}"
                        </Text>{' '}
                        and move it there when they approve.
                    </Text>
                    <SpaceSelector
                        projectUuid={projectUuid}
                        selectedSpaceUuid={form.values.targetSpaceUuid}
                        spaces={targetSpaces}
                        isLoading={isLoadingSpaces}
                        itemType={
                            contentType === ContentType.CHART
                                ? ResourceViewItemType.CHART
                                : ResourceViewItemType.DASHBOARD
                        }
                        onSelectSpace={(spaceUuid) =>
                            form.setFieldValue('targetSpaceUuid', spaceUuid)
                        }
                    />
                    <Textarea
                        label="Note for reviewers"
                        description="What does it show, and who is it for?"
                        autosize
                        minRows={2}
                        maxRows={6}
                        {...form.getInputProps('note')}
                    />
                    {aside}
                </Stack>
            </form>
        </MantineModal>
    );
};

export default RequestReviewModal;
