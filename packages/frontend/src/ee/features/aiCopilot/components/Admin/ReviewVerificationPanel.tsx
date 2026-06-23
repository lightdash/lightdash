import {
    CiCheckState,
    ValidationErrorType,
    type AiAgentReviewItemSummary,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Divider,
    Group,
    Loader,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine-8/core';
import {
    IconArrowUpRight,
    IconChecks,
    IconCircleCheck,
    IconCircleCheckFilled,
    IconColumns,
    IconFileDiff,
    IconGitPullRequest,
    IconListCheck,
    IconMessages,
    IconRefresh,
} from '@tabler/icons-react';
import { useMemo, useState, type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useProjectValidation } from '../../../../../hooks/validation/useValidation';
import {
    useAiAgentReviewItemPrDiff,
    useProjectUpstreamDiff,
} from '../../hooks/useAiAgentAdmin';
import { usePullRequestCiChecks } from '../../hooks/usePullRequestCiChecks';
import { ReviewFieldsModal } from './ReviewFieldsModal';
import { ReviewPrDiffModal } from './ReviewPrDiffModal';
import { ReviewValidationModal } from './ReviewValidationModal';
import styles from './ReviewVerificationPanel.module.css';

type Props = {
    reviewItem: AiAgentReviewItemSummary;
    canRetry: boolean;
    isBusy: boolean;
    isResolving: boolean;
    onRetry: () => void;
    onMarkDone: () => void;
};

const getPrNumber = (prUrl: string): string | null => {
    const match = prUrl.match(/\/pull\/(\d+)/);
    return match ? match[1] : null;
};

// A single colour-coded phrase for the Checks row, prioritising whatever needs
// attention: failures first, then in-flight runs, else all passed.
const summariseChecks = (
    checks: { state: CiCheckState }[],
): { color: string; label: string } | null => {
    if (checks.length === 0) return null;
    const count = (state: CiCheckState) =>
        checks.filter((c) => c.state === state).length;
    const failed = count(CiCheckState.FAILURE);
    const pending = count(CiCheckState.PENDING);
    if (failed > 0) return { color: 'red.8', label: `${failed} failing` };
    if (pending > 0) return { color: 'yellow.8', label: `${pending} running` };
    return { color: 'green.8', label: `${checks.length} passed` };
};

const Row: FC<{
    icon: typeof IconFileDiff;
    label: string;
    trailing?: ReactNode;
}> = ({ icon, label, trailing }) => (
    <>
        <MantineIcon icon={icon} size="md" color="ldGray.7" />
        <Text fz="sm" fw={500} truncate className={styles.rowLabel}>
            {label}
        </Text>
        {trailing}
    </>
);

export const ReviewVerificationPanel: FC<Props> = ({
    reviewItem,
    canRetry,
    isBusy,
    isResolving,
    onRetry,
    onMarkDone,
}) => {
    const [diffOpened, setDiffOpened] = useState(false);
    const [fieldsOpened, setFieldsOpened] = useState(false);
    const [validationOpened, setValidationOpened] = useState(false);
    const remediation = reviewItem.remediation ?? null;
    const linkedPrUrl = remediation?.linkedPrUrl ?? null;
    const prNumber = linkedPrUrl ? getPrNumber(linkedPrUrl) : null;
    const isResolved = reviewItem.status === 'resolved';
    const previewProjectUuid = remediation?.previewProjectUuid ?? null;
    const sourceThreadUrl =
        remediation?.sourceThreadUuid &&
        `/projects/${remediation.sourceProjectUuid}/ai-agents/${remediation.sourceAgentUuid}/threads/${remediation.sourceThreadUuid}`;

    const { data: prDiff, isLoading: isLoadingPrDiff } =
        useAiAgentReviewItemPrDiff(reviewItem.fingerprint, {
            enabled: !!linkedPrUrl,
        });

    // The write-back PR lives in the source project's git repo, so its
    // installation resolves the CI checks. No commit is pinned here — the
    // backend falls back to the PR's live head.
    const { data: ciChecks } = usePullRequestCiChecks(
        remediation?.sourceProjectUuid,
        linkedPrUrl,
        null,
    );
    const checksSummary = ciChecks ? summariseChecks(ciChecks.checks) : null;

    const { data: upstreamDiff, isLoading: isLoadingFields } =
        useProjectUpstreamDiff(previewProjectUuid ?? undefined, {
            enabled: !!previewProjectUuid,
        });
    const fields = useMemo(() => upstreamDiff?.fields ?? [], [upstreamDiff]);
    const fieldCounts = useMemo(
        () => ({
            added: fields.filter((f) => f.change === 'added').length,
            updated: fields.filter((f) => f.change === 'label_changed').length,
            removed: fields.filter((f) => f.change === 'removed').length,
        }),
        [fields],
    );
    const showFieldsRow =
        !!previewProjectUuid && (isLoadingFields || fields.length > 0);

    const { data: validationErrors, isLoading: isLoadingValidation } =
        useProjectValidation(previewProjectUuid);
    // Match the validator modal, which hides chart-configuration warnings by
    // default — so the count here lines up with what the modal shows.
    const validationErrorCount =
        validationErrors?.filter(
            (e) => e.errorType !== ValidationErrorType.ChartConfiguration,
        ).length ?? 0;

    return (
        <div className={styles.gutter}>
            <Stack
                gap="sm"
                className={`${styles.card} ${
                    isResolved ? styles.cardResolved : ''
                }`}
            >
                {isResolved ? (
                    <Group gap="xs" wrap="nowrap">
                        <MantineIcon
                            icon={IconCircleCheckFilled}
                            color="green.7"
                            size="lg"
                        />
                        <Text fz="sm" fw={600}>
                            Verified
                        </Text>
                    </Group>
                ) : (
                    <Text fz="sm" fw={600} c="dimmed">
                        Verification
                    </Text>
                )}

                <Text fz="sm" fw={600} lineClamp={2}>
                    {reviewItem.title}
                </Text>

                <Stack gap={2}>
                    {linkedPrUrl && (
                        <Anchor
                            className={styles.row}
                            href={linkedPrUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            underline="never"
                        >
                            <Row
                                icon={IconGitPullRequest}
                                label={
                                    prNumber
                                        ? `Pull request #${prNumber}`
                                        : 'Pull request'
                                }
                                trailing={
                                    <MantineIcon
                                        icon={IconArrowUpRight}
                                        size="sm"
                                        color="dimmed"
                                    />
                                }
                            />
                        </Anchor>
                    )}

                    {linkedPrUrl && (
                        <UnstyledButton
                            className={styles.row}
                            onClick={() => setDiffOpened(true)}
                        >
                            <Row
                                icon={IconFileDiff}
                                label="Changes"
                                trailing={
                                    isLoadingPrDiff ? (
                                        <Loader size={12} color="gray" />
                                    ) : prDiff ? (
                                        <Text fz="sm" fw={600}>
                                            <Text
                                                span
                                                fz="sm"
                                                fw={600}
                                                c="green.8"
                                            >
                                                +{prDiff.totalAdditions}
                                            </Text>{' '}
                                            <Text
                                                span
                                                fz="sm"
                                                fw={600}
                                                c="red.8"
                                            >
                                                −{prDiff.totalDeletions}
                                            </Text>
                                        </Text>
                                    ) : undefined
                                }
                            />
                        </UnstyledButton>
                    )}

                    {linkedPrUrl && checksSummary && (
                        <Anchor
                            className={styles.row}
                            href={`${linkedPrUrl}/checks`}
                            target="_blank"
                            rel="noopener noreferrer"
                            underline="never"
                        >
                            <Row
                                icon={IconChecks}
                                label="Checks"
                                trailing={
                                    <Text
                                        fz="sm"
                                        fw={600}
                                        c={checksSummary.color}
                                    >
                                        {checksSummary.label}
                                    </Text>
                                }
                            />
                        </Anchor>
                    )}

                    {showFieldsRow && (
                        <UnstyledButton
                            className={styles.row}
                            onClick={() => setFieldsOpened(true)}
                        >
                            <Row
                                icon={IconColumns}
                                label="Fields"
                                trailing={
                                    isLoadingFields ? (
                                        <Loader size={12} color="gray" />
                                    ) : (
                                        <Text fz="sm" fw={600}>
                                            <Text
                                                span
                                                fz="sm"
                                                fw={600}
                                                c="green.8"
                                            >
                                                +{fieldCounts.added}
                                            </Text>{' '}
                                            {fieldCounts.updated > 0 && (
                                                <>
                                                    <Text
                                                        span
                                                        fz="sm"
                                                        fw={600}
                                                        c="yellow.8"
                                                    >
                                                        ~{fieldCounts.updated}
                                                    </Text>{' '}
                                                </>
                                            )}
                                            <Text
                                                span
                                                fz="sm"
                                                fw={600}
                                                c="red.8"
                                            >
                                                −{fieldCounts.removed}
                                            </Text>
                                        </Text>
                                    )
                                }
                            />
                        </UnstyledButton>
                    )}

                    {previewProjectUuid && (
                        <UnstyledButton
                            className={styles.row}
                            onClick={() => setValidationOpened(true)}
                        >
                            <Row
                                icon={IconListCheck}
                                label="Validator"
                                trailing={
                                    isLoadingValidation ? (
                                        <Loader size={12} color="gray" />
                                    ) : (
                                        <Text
                                            fz="sm"
                                            fw={600}
                                            c={
                                                validationErrorCount > 0
                                                    ? 'red.8'
                                                    : 'green.8'
                                            }
                                        >
                                            {validationErrorCount}
                                        </Text>
                                    )
                                }
                            />
                        </UnstyledButton>
                    )}

                    {sourceThreadUrl && (
                        <Anchor
                            className={styles.row}
                            component={Link}
                            to={sourceThreadUrl}
                            target="_blank"
                            underline="never"
                        >
                            <Row
                                icon={IconMessages}
                                label="Where it was flagged"
                                trailing={
                                    <MantineIcon
                                        icon={IconArrowUpRight}
                                        size="sm"
                                        color="dimmed"
                                    />
                                }
                            />
                        </Anchor>
                    )}

                    {!isResolved && canRetry && (
                        <UnstyledButton
                            className={styles.row}
                            disabled={isBusy}
                            onClick={onRetry}
                        >
                            <Row icon={IconRefresh} label="Retry question" />
                        </UnstyledButton>
                    )}
                </Stack>

                <Divider />

                {isResolved ? (
                    <Anchor
                        component={Link}
                        to="/generalSettings/ai/issues"
                        fz="sm"
                        fw={500}
                    >
                        Back to issues
                    </Anchor>
                ) : (
                    <Button
                        size="xs"
                        color="green"
                        fullWidth
                        loading={isResolving}
                        onClick={onMarkDone}
                        leftSection={
                            <MantineIcon icon={IconCircleCheck} size="sm" />
                        }
                    >
                        Mark as done
                    </Button>
                )}
            </Stack>

            <ReviewPrDiffModal
                opened={diffOpened}
                onClose={() => setDiffOpened(false)}
                diff={prDiff}
                isLoading={isLoadingPrDiff}
            />

            {previewProjectUuid && (
                <ReviewFieldsModal
                    opened={fieldsOpened}
                    onClose={() => setFieldsOpened(false)}
                    projectUuid={previewProjectUuid}
                    fields={fields}
                    isLoading={isLoadingFields}
                />
            )}

            {previewProjectUuid && (
                <ReviewValidationModal
                    opened={validationOpened}
                    onClose={() => setValidationOpened(false)}
                    projectUuid={previewProjectUuid}
                />
            )}
        </div>
    );
};
