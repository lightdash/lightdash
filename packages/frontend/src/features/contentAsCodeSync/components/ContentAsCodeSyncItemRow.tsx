import {
    Badge,
    Box,
    Button,
    Group,
    Paper,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { format } from 'date-fns';
import { type FC } from 'react';
import TruncatedText from '../../../components/common/TruncatedText';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { type ContentAsCodeSyncItem } from '../types';
import {
    canRestampContentAsCodeSyncItem,
    CONTENT_AS_CODE_SYNC_STATE_BADGE,
} from '../utils/contentAsCodeSyncState';
import { getContentAsCodeTypeLabel } from '../utils/contentAsCodeTypeLabel';
import { toDate } from '../utils/toDate';
import ContentAsCodeSyncProposeActions from './ContentAsCodeSyncProposeActions';
import classes from './ContentAsCodeSyncStatusPanel.module.css';

type ContentAsCodeSyncItemRowProps = {
    projectUuid: string;
    item: ContentAsCodeSyncItem;
    canRestamp: boolean;
    canPropose: boolean;
    isRestamping: boolean;
    isProposing: boolean;
    isRestampAvailable: boolean;
    isProposeAvailable: boolean;
    onViewDiff: () => void;
    onRestamp: () => void;
    onPropose: () => void;
};

const AppliedTime: FC<{ value: Date | string }> = ({ value }) => {
    const timeAgo = useTimeAgo(value);
    return (
        <Text fz="xs" c="ldGray.6">
            Last applied {timeAgo} ·{' '}
            {format(toDate(value), 'MMM d, yyyy HH:mm')}
        </Text>
    );
};

const restampDisabledReason = ({
    canRestamp,
    isRestampAvailable,
    item,
}: Pick<
    ContentAsCodeSyncItemRowProps,
    'canRestamp' | 'isRestampAvailable' | 'item'
>): string | null => {
    if (!isRestampAvailable) {
        return 'The API is not available yet.';
    }

    if (!canRestamp) {
        return null;
    }

    if (!canRestampContentAsCodeSyncItem(item.state)) {
        return 'This slug is already in sync.';
    }

    return null;
};

const ContentAsCodeSyncItemRow: FC<ContentAsCodeSyncItemRowProps> = ({
    projectUuid,
    item,
    canRestamp,
    canPropose,
    isRestamping,
    isProposing,
    isRestampAvailable,
    isProposeAvailable,
    onViewDiff,
    onRestamp,
    onPropose,
}) => {
    const stateBadge = CONTENT_AS_CODE_SYNC_STATE_BADGE[item.state];
    const canShowRestamp = canRestamp;
    const restampDisabled =
        !isRestampAvailable || !canRestampContentAsCodeSyncItem(item.state);
    const disabledReason = restampDisabledReason({
        canRestamp,
        isRestampAvailable,
        item,
    });
    const canViewDiff = item.state === 'ahead';

    return (
        <Paper withBorder p="md" radius="md">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap="xs" className={classes.itemMeta}>
                    <Group gap="xs">
                        <Badge variant="light" size="sm" tt="none">
                            {getContentAsCodeTypeLabel(item.contentType)}
                        </Badge>
                        <Badge
                            variant="light"
                            size="sm"
                            tt="none"
                            color={stateBadge.color}
                        >
                            {stateBadge.label}
                        </Badge>
                    </Group>
                    <TruncatedText maxWidth="100%" fw={500}>
                        {item.slug}
                    </TruncatedText>
                    {item.appliedAt ? (
                        <AppliedTime value={item.appliedAt} />
                    ) : (
                        <Text fz="xs" c="ldGray.6">
                            No last-applied snapshot
                        </Text>
                    )}
                </Stack>
                <Group gap="xs" wrap="nowrap" className={classes.itemActions}>
                    {canViewDiff ? (
                        <Button
                            variant="default"
                            size="xs"
                            onClick={onViewDiff}
                        >
                            View diff
                        </Button>
                    ) : null}
                    {canPropose ? (
                        <ContentAsCodeSyncProposeActions
                            projectUuid={projectUuid}
                            item={item}
                            isProposeAvailable={isProposeAvailable}
                            isProposing={isProposing}
                            onPropose={onPropose}
                        />
                    ) : null}
                    {canShowRestamp ? (
                        <Tooltip
                            label={disabledReason}
                            disabled={!disabledReason}
                        >
                            <Box>
                                <Button
                                    variant="default"
                                    size="xs"
                                    disabled={restampDisabled}
                                    loading={isRestamping}
                                    onClick={onRestamp}
                                >
                                    Use git version on next deploy
                                </Button>
                            </Box>
                        </Tooltip>
                    ) : null}
                </Group>
            </Group>
        </Paper>
    );
};

export default ContentAsCodeSyncItemRow;
