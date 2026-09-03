import {
    ContentReviewContentType,
    DEFAULT_USER_SPACES_PARENT_NAME,
    ResourceViewItemType,
    type SpaceSummary,
} from '@lightdash/common';
import { Button, Group, Stack, Text, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconArrowRight, IconFolder, IconSend } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import { IconBox } from '../../../../components/common/ResourceIcon';
import SpaceSelector from '../../../../components/common/SpaceSelector/SpaceSelector';
import {
    usePersonalSpace,
    useSpaceSummaries,
} from '../../../../hooks/useSpaces';
import { useCreateContentReviewRequest } from '../hooks/useContentReviewRequests';
import { useSimilarContent } from '../hooks/useSimilarContent';
import {
    getContentTypeColor,
    getContentTypeIcon,
    getContentTypeNoun,
} from '../utils';
import classes from './RequestReviewModal.module.css';
import SimilarContentPanel from './SimilarContentPanel';

type Props = {
    projectUuid: string;
    contentType: ContentReviewContentType;
    contentUuid: string;
    contentName: string;
    opened: boolean;
    onClose: () => void;
};

type Step = 'space' | 'note';

type TargetSpaceOption = Pick<
    SpaceSummary,
    'uuid' | 'name' | 'parentSpaceUuid'
>;

// Personal spaces, and the folder that holds them, are never review targets
const getTargetSpaces = <T extends TargetSpaceOption>(
    spaces: T[],
    personalSpaceUuid: string | undefined,
): T[] => {
    const personalRoots = new Set(
        spaces
            .filter((space) => space.name === DEFAULT_USER_SPACES_PARENT_NAME)
            .map((space) => space.uuid),
    );
    return spaces.filter(
        (space) =>
            space.uuid !== personalSpaceUuid &&
            !personalRoots.has(space.uuid) &&
            !(
                space.parentSpaceUuid &&
                personalRoots.has(space.parentSpaceUuid)
            ),
    );
};

const RequestReviewModal: FC<Props> = ({
    projectUuid,
    contentType,
    contentUuid,
    contentName,
    opened,
    onClose,
}) => {
    const [step, setStep] = useState<Step>('space');
    const { data: personalSpace } = usePersonalSpace(projectUuid, {
        enabled: opened,
    });
    const { data: spaces = [], isInitialLoading: isLoadingSpaces } =
        useSpaceSummaries(projectUuid, true, { enabled: opened });
    const targetSpaces = useMemo(
        () => getTargetSpaces(spaces, personalSpace?.uuid),
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
    const targetSpace = targetSpaces.find(
        (space) => space.uuid === form.values.targetSpaceUuid,
    );

    const handleClose = () => {
        form.reset();
        setStep('space');
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

    const typeLabel = getContentTypeNoun(contentType);
    const isSpaceStep = step === 'space';

    return (
        <MantineModal
            title="Request review"
            subtitle={
                isSpaceStep
                    ? 'Step 1 of 2. Where it belongs'
                    : 'Step 2 of 2. Why it belongs there'
            }
            opened={opened}
            onClose={handleClose}
            icon={IconSend}
            size="lg"
            leftActions={
                isSpaceStep ? null : (
                    <Button variant="subtle" onClick={() => setStep('space')}>
                        Back
                    </Button>
                )
            }
            actions={
                isSpaceStep ? (
                    <Button
                        disabled={form.values.targetSpaceUuid === null}
                        onClick={() => setStep('note')}
                    >
                        Continue
                    </Button>
                ) : (
                    <Button
                        type="submit"
                        form="request-review-form"
                        loading={isSubmitting}
                        disabled={
                            form.values.targetSpaceUuid === null ||
                            (noteRequired &&
                                form.values.note.trim().length === 0)
                        }
                    >
                        Request review
                    </Button>
                )
            }
        >
            <form id="request-review-form" onSubmit={handleSubmit}>
                {isSpaceStep ? (
                    <Stack gap="md">
                        <Text fz="sm" c="dimmed">
                            The people who can edit the space you pick will
                            review this {typeLabel} and move it there when they
                            approve.
                        </Text>
                        <SpaceSelector
                            projectUuid={projectUuid}
                            selectedSpaceUuid={form.values.targetSpaceUuid}
                            spaces={targetSpaces}
                            isLoading={isLoadingSpaces}
                            itemType={
                                contentType ===
                                ContentReviewContentType.DASHBOARD
                                    ? ResourceViewItemType.DASHBOARD
                                    : ResourceViewItemType.CHART
                            }
                            onSelectSpace={(spaceUuid) =>
                                form.setFieldValue('targetSpaceUuid', spaceUuid)
                            }
                        />
                    </Stack>
                ) : (
                    <Stack gap="md">
                        <Group
                            gap="sm"
                            wrap="nowrap"
                            className={classes.summary}
                        >
                            <IconBox
                                icon={getContentTypeIcon(contentType)}
                                color={getContentTypeColor(contentType)}
                                boxSize={28}
                                size="lg"
                            />
                            <Text fz="sm" fw={500} lineClamp={1}>
                                {contentName}
                            </Text>
                            <MantineIcon icon={IconArrowRight} color="dimmed" />
                            <Group
                                gap={4}
                                wrap="nowrap"
                                className="ld-shrink-0"
                            >
                                <MantineIcon icon={IconFolder} color="dimmed" />
                                <Text fz="sm" fw={500}>
                                    {targetSpace?.name ?? 'Shared space'}
                                </Text>
                            </Group>
                        </Group>
                        <SimilarContentPanel
                            projectUuid={projectUuid}
                            items={similarContent}
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
                            minRows={3}
                            maxRows={6}
                            data-autofocus
                            {...form.getInputProps('note')}
                        />
                    </Stack>
                )}
            </form>
        </MantineModal>
    );
};

export default RequestReviewModal;
