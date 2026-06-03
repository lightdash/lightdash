import { Loader, Stack, Text, ThemeIcon } from '@mantine-8/core';
import { IconCheck, IconGitPullRequest, IconX } from '@tabler/icons-react';
import { type FC, useState } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import {
    useAiAgentAdminReviewItem,
    useAiAgentReviewItemWritebackPreview,
    useCreateAiAgentReviewItemWriteback,
} from '../../hooks/useAiAgentAdmin';
import { ProjectContextDiffPreview } from './ProjectContextDiffPreview';

type ProjectContextWritebackModalProps = {
    fingerprint: string;
    opened: boolean;
    onClose: () => void;
};

// Keeps the body a consistent size across loading / diff / progress states so
// the modal doesn't jump as content swaps in.
const BODY_MIN_HEIGHT = '48vh';

export const ProjectContextWritebackModal: FC<
    ProjectContextWritebackModalProps
> = ({ fingerprint, opened, onClose }) => {
    const [submitted, setSubmitted] = useState(false);

    const preview = useAiAgentReviewItemWritebackPreview(fingerprint, {
        enabled: opened && !submitted,
    });
    const createWriteback = useCreateAiAgentReviewItemWriteback();

    // Once submitted, poll the item so the live writeback phase messages surface
    // here (same job the row polls — shared query cache).
    const { data: tracked } = useAiAgentAdminReviewItem(fingerprint, {
        enabled: submitted,
        refetchInterval: submitted ? 2000 : false,
    });

    const linkedPrUrl = tracked?.linkedPrUrl ?? null;
    const status = tracked?.prWritebackStatus;
    const isFailed = status === 'failed';
    const isDone = !!linkedPrUrl || status === 'completed';
    const previewData = preview.data;

    const handleClose = () => {
        setSubmitted(false);
        onClose();
    };

    // One primary button at a time: "Looks good, open PR" before submit, then
    // "View PR" once the PR exists — no separate action button.
    const handlePrimary = () => {
        if (isDone && linkedPrUrl) {
            window.open(linkedPrUrl, '_blank', 'noopener,noreferrer');
            return;
        }
        createWriteback.mutate(fingerprint);
        setSubmitted(true);
    };

    const showPrimary =
        (!submitted && previewData?.available === true) ||
        (isDone && !!linkedPrUrl);
    const primaryLabel = isDone ? 'View PR' : 'Looks good, open PR';

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title="Open project context PR"
            icon={IconGitPullRequest}
            size="80vw"
            onConfirm={showPrimary ? handlePrimary : undefined}
            confirmLabel={primaryLabel}
            confirmLoading={createWriteback.isLoading}
            cancelLabel={submitted ? 'Close' : 'Cancel'}
            bodyScrollAreaMaxHeight="calc(85vh - 160px)"
        >
            {submitted ? (
                <Stack
                    mih={BODY_MIN_HEIGHT}
                    align="center"
                    justify="center"
                    gap="sm"
                >
                    {isFailed ? (
                        <>
                            <ThemeIcon
                                size="xl"
                                radius="xl"
                                variant="light"
                                color="red"
                            >
                                <MantineIcon icon={IconX} />
                            </ThemeIcon>
                            <Text fw={600}>Couldn&rsquo;t open the PR</Text>
                            <Text fz="sm" c="ldGray.6" ta="center" maw={420}>
                                {tracked?.prWritebackMessage ??
                                    'The writeback failed. You can try again.'}
                            </Text>
                        </>
                    ) : isDone ? (
                        <>
                            <ThemeIcon
                                size="xl"
                                radius="xl"
                                variant="light"
                                color="green"
                            >
                                <MantineIcon icon={IconCheck} />
                            </ThemeIcon>
                            <Text fw={600}>Pull request opened</Text>
                            <Text fz="sm" c="ldGray.6" ta="center" maw={420}>
                                The project context change is ready to review on
                                GitHub.
                            </Text>
                        </>
                    ) : (
                        <>
                            <Loader size="md" color="gray" />
                            <Text fw={500} c="ldGray.7">
                                {tracked?.prWritebackMessage ??
                                    'Opening pull request…'}
                            </Text>
                            <Text fz="sm" c="ldGray.5">
                                This runs in the background — safe to close.
                            </Text>
                        </>
                    )}
                </Stack>
            ) : (
                <Stack gap="sm" mih={BODY_MIN_HEIGHT}>
                    {previewData?.available === true && (
                        <Text fz="sm" c="ldGray.6">
                            This opens a pull request{' '}
                            {previewData.op === 'update'
                                ? 'updating'
                                : 'adding'}{' '}
                            an entry in{' '}
                            <Text span fw={600} fz="inherit" c="ldGray.8">
                                {previewData.fileName}
                            </Text>
                            .
                        </Text>
                    )}

                    {preview.isLoading && (
                        <Stack
                            flex={1}
                            mih={BODY_MIN_HEIGHT}
                            align="center"
                            justify="center"
                            gap="sm"
                        >
                            <Loader size="md" color="gray" />
                            <Text fz="sm" c="ldGray.6">
                                Computing the change…
                            </Text>
                        </Stack>
                    )}

                    {preview.isError && (
                        <Text fz="sm" c="red">
                            Couldn&rsquo;t compute the change preview. You can
                            still open the PR and review it on GitHub.
                        </Text>
                    )}

                    {previewData?.available === true && (
                        <ProjectContextDiffPreview
                            fileName={previewData.fileName}
                            before={previewData.before}
                            after={previewData.after}
                        />
                    )}

                    {previewData?.available === false && (
                        <Text fz="sm" c="ldGray.6">
                            This change runs in a sandbox — the diff will be on
                            the pull request itself.
                        </Text>
                    )}
                </Stack>
            )}
        </MantineModal>
    );
};
