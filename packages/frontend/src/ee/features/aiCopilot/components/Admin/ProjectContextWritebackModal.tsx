import { Loader, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconCheck, IconGitPullRequest, IconX } from '@tabler/icons-react';
import { type FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Callout from '../../../../../components/common/Callout';
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
    const { t } = useTranslation('aiCopilotAdmin');
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
    const primaryLabel = isDone
        ? t('contextWriteback.viewPr')
        : t('contextWriteback.openPr');

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title={t('contextWriteback.title')}
            icon={IconGitPullRequest}
            size="80vw"
            onConfirm={showPrimary ? handlePrimary : undefined}
            confirmLabel={primaryLabel}
            confirmLoading={createWriteback.isLoading}
            cancelLabel={
                submitted
                    ? t('contextWriteback.close')
                    : t('contextWriteback.cancel')
            }
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
                            <Text fw={600}>
                                {t('contextWriteback.failedTitle')}
                            </Text>
                            <Text fz="sm" c="dimmed" ta="center" maw={420}>
                                {tracked?.prWritebackMessage ??
                                    t('contextWriteback.failedDescription')}
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
                            <Text fw={600}>
                                {t('contextWriteback.openedTitle')}
                            </Text>
                            <Text fz="sm" c="dimmed" ta="center" maw={420}>
                                {t('contextWriteback.openedDescription')}
                            </Text>
                        </>
                    ) : (
                        <>
                            <Loader size="md" color="gray" />
                            <Text fw={500} c="ldGray.7">
                                {tracked?.prWritebackMessage ??
                                    t('contextWriteback.opening')}
                            </Text>
                            <Text fz="sm" c="ldGray.5">
                                {t('contextWriteback.backgroundNote')}
                            </Text>
                        </>
                    )}
                </Stack>
            ) : (
                <Stack gap="sm" mih={BODY_MIN_HEIGHT}>
                    {preview.isLoading && (
                        <Stack
                            flex={1}
                            mih={BODY_MIN_HEIGHT}
                            align="center"
                            justify="center"
                            gap="sm"
                        >
                            <Loader size="md" color="gray" />
                            <Text fz="sm" c="dimmed">
                                {t('contextWriteback.computing')}
                            </Text>
                        </Stack>
                    )}

                    {preview.isError && (
                        <Text fz="sm" c="red">
                            {t('contextWriteback.previewError')}
                        </Text>
                    )}

                    {previewData?.available === true &&
                        previewData.upgradesFileToV2 && (
                            <Callout variant="info">
                                {t('contextWriteback.upgradesV2')}
                            </Callout>
                        )}

                    {previewData?.available === true && (
                        <ProjectContextDiffPreview
                            fileName={previewData.fileName}
                            before={previewData.before}
                            after={previewData.after}
                            op={previewData.op}
                        />
                    )}

                    {previewData?.available === false && (
                        <Text fz="sm" c="dimmed">
                            {t('contextWriteback.sandboxNote')}
                        </Text>
                    )}
                </Stack>
            )}
        </MantineModal>
    );
};
