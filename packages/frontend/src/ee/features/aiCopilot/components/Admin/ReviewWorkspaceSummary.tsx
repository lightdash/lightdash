import { type AiAgentReviewItemSummary } from '@lightdash/common';
import { Box, Button, Stack, Text } from '@mantine-8/core';
import { IconLayoutColumns } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAiAgentReviewItemActivity } from '../../hooks/useAiAgentAdmin';
import styles from './ReviewWorkspaceSummary.module.css';

type Props = {
    reviewItem: AiAgentReviewItemSummary;
    onNavigate?: () => void;
};

/**
 * Rail summary of the remediation workspace: the entry point, and whether
 * the verification verdict is in — the one status the rail should answer.
 */
export const ReviewWorkspaceSummary: FC<Props> = ({
    reviewItem,
    onNavigate,
}) => {
    const remediation = reviewItem.remediation;
    const { data: activity } = useAiAgentReviewItemActivity(
        reviewItem.fingerprint,
        { enabled: remediation !== null },
    );

    if (!remediation) {
        return null;
    }

    const workspaceUrl = `/generalSettings/ai/issues/${encodeURIComponent(
        reviewItem.fingerprint,
    )}`;

    const verdictReady =
        activity?.events.some(
            (event) =>
                event.kind === 'remediation' &&
                event.eventType === 'verification_completed',
        ) ?? false;
    const verdict = verdictReady
        ? ({ state: 'ready', label: 'Verdict ready' } as const)
        : activity?.liveState === 'verifying'
          ? ({ state: 'live', label: 'Verifying the fix…' } as const)
          : ({ state: 'pending', label: 'No verdict yet' } as const);

    return (
        <Stack gap="sm" className={styles.workspace}>
            <Text className={styles.label}>Workspace</Text>
            <Button
                component={Link}
                to={workspaceUrl}
                onClick={onNavigate}
                size="xs"
                color="dark"
                radius="md"
                fullWidth
                leftSection={<MantineIcon icon={IconLayoutColumns} size={14} />}
            >
                Open workspace
            </Button>
            <Box className={styles.verdict} data-state={verdict.state}>
                <Box component="span" className={styles.verdictDot} />
                {verdict.label}
            </Box>
        </Stack>
    );
};
