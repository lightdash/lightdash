import {
    ContentType,
    ResourceViewItemType,
    type ContentReviewContentType,
} from '@lightdash/common';
import { Button, LoadingOverlay, Stack, Text, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconSend } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineModal from '../../../../components/common/MantineModal';
import SpaceSelector from '../../../../components/common/SpaceSelector/SpaceSelector';
import {
    usePersonalSpace,
    useSpaceSummaries,
} from '../../../../hooks/useSpaces';
import { useCreateContentReviewRequest } from '../hooks/useContentReviewRequests';
import { useSimilarContent } from '../hooks/useSimilarContent';
import SimilarContentPanel from './SimilarContentPanel';

type Props = {
    projectUuid: string;
    contentType: ContentReviewContentType;
    contentUuid: string;
    contentName: string;
    opened: boolean;
    onClose: () => void;
};

const RequestReviewModal: FC<Props> = ({
    projectUuid,
    contentType,
    contentUuid,
    contentName,
    opened,
    onClose,
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
    const { data: similarContent = [] } = useSimilarContent(
        projectUuid,
        { contentType, name: contentName, excludeContentUuid: contentUuid },
        opened,
    );
    // When lookalikes exist the requester has to say what theirs adds
    const noteRequired = similarContent.length > 0;

    const form = useForm<{ targetSpaceUuid: string | null; note: string }>({
        initialValues: { targetSpaceUuid: null, note: '' },
    });

    const handleClose = () => {
        form.reset();
        onClose();
    };

    const handleSubmit = form.onSubmit(async (values) => {
        if (values.targetSpaceUuid === null) return;
        const note = values.note.trim();
        if (noteRequired && note.length === 0) return;
        await createRequest({
            contentType,
            contentUuid,
            targetSpaceUuid: values.targetSpaceUuid,
            note: note.length > 0 ? note : null,
            similarContent,
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
            size="lg"
            actions={
                <Button
                    type="submit"
                    form="request-review-form"
                    loading={isSubmitting}
                    disabled={
                        form.values.targetSpaceUuid === null ||
                        (noteRequired && form.values.note.trim().length === 0)
                    }
                >
                    Request review
                </Button>
            }
        >
            <form id="request-review-form" onSubmit={handleSubmit}>
                <LoadingOverlay visible={isLoadingSpaces} />
                <Stack gap="lg">
                    <Stack gap={4}>
                        <Text fz="sm" fw={500}>
                            Where does this {typeLabel} belong?
                        </Text>
                        <Text fz="sm" c="dimmed">
                            The people who can edit the space you pick will
                            review{' '}
                            <Text component="span" fw={500} c="text">
                                "{contentName}"
                            </Text>{' '}
                            and move it there when they approve.
                        </Text>
                    </Stack>
                    <SimilarContentPanel
                        projectUuid={projectUuid}
                        items={similarContent}
                    />
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
                        treeHeight={240}
                    />
                    <Textarea
                        label="Note for reviewers"
                        description={
                            noteRequired
                                ? 'What does yours add that the existing content does not?'
                                : 'What does it show, and who is it for?'
                        }
                        required={noteRequired}
                        withAsterisk={noteRequired}
                        autosize
                        minRows={2}
                        maxRows={6}
                        {...form.getInputProps('note')}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};

export default RequestReviewModal;
