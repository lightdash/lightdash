import {
    isAppVersionInProgress,
    type AppVersionStatus,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    CopyButton,
    Divider,
    Group,
    HoverCard,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine-8/core';
import {
    IconCheck,
    IconClock,
    IconCopy,
    IconEye,
    IconFolder,
    IconHash,
    IconHistory,
    IconInfoCircle,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { type FC } from 'react';
import { Link } from 'react-router';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import MantineIcon from '../MantineIcon';
import InfoRow from '../PageHeader/InfoRow';
import { DashboardList } from './DashboardList';
import styles from './ResourceInfoPopup.module.css';

const versionStatusLabel = (status: AppVersionStatus): string => {
    if (status === 'error') return 'error';
    if (status === 'ready') return 'ready';
    if (isAppVersionInProgress(status)) return 'building';
    return status;
};

type Props = {
    resourceUuid: string;
    withChartData?: boolean;
    title?: string;
    description?: string;
    slug?: string;
    updatedAt?: Date | string | null;
    spaceName?: string;
    spaceUuid?: string | null;
    projectUuid: string;
    viewStats?: number;
    firstViewedAt?: Date | string | null;
    latestVersion?: { number: number; status: AppVersionStatus } | null;
};

export const ResourceInfoPopup: FC<Props> = ({
    resourceUuid,
    title,
    description,
    slug,
    updatedAt,
    spaceName,
    spaceUuid,
    projectUuid,
    viewStats,
    firstViewedAt,
    withChartData = false,
    latestVersion,
}) => {
    const timeAgo = useTimeAgo(updatedAt ?? new Date());
    const label =
        firstViewedAt && viewStats
            ? `${viewStats} views since ${dayjs(firstViewedAt).format(
                  'MMM D, YYYY h:mm A',
              )}`
            : undefined;
    const hasMetadataRows =
        !!updatedAt ||
        viewStats !== undefined ||
        !!(spaceName && spaceUuid) ||
        !!latestVersion;
    const shouldShowDivider =
        !!slug && (hasMetadataRows || !!description || withChartData);
    const hasContent =
        !!title ||
        !!description ||
        !!slug ||
        !!withChartData ||
        !!updatedAt ||
        viewStats !== undefined ||
        !!(spaceName && spaceUuid) ||
        !!latestVersion;

    if (!hasContent) return null;

    return (
        <HoverCard offset={-1} position="bottom" shadow="md" withinPortal>
            <HoverCard.Target>
                <MantineIcon icon={IconInfoCircle} color="ldGray.6" />
            </HoverCard.Target>
            <HoverCard.Dropdown
                w={320}
                p="md"
                className={styles.resourceInfoOverlay}
            >
                <Stack gap="sm">
                    {(title || description) && (
                        <Box>
                            {title && (
                                <Text fz="sm" fw={600} c="ldGray.9" mb={4}>
                                    {title}
                                </Text>
                            )}
                            {description && (
                                <Text
                                    fz="xs"
                                    c="dimmed"
                                    className={styles.preLineText}
                                >
                                    {description}
                                </Text>
                            )}
                        </Box>
                    )}

                    <Stack gap={10}>
                        {updatedAt && (
                            <InfoRow icon={IconClock} label="Last modified">
                                {timeAgo}
                            </InfoRow>
                        )}

                        {viewStats !== undefined ? (
                            <InfoRow icon={IconEye} label="Views">
                                <Tooltip
                                    position="top-start"
                                    label={label}
                                    disabled={!viewStats || !firstViewedAt}
                                >
                                    <span>{viewStats.toLocaleString()}</span>
                                </Tooltip>
                            </InfoRow>
                        ) : null}

                        {spaceName && spaceUuid && (
                            <InfoRow icon={IconFolder} label="Space">
                                <Anchor
                                    component={Link}
                                    to={`/projects/${projectUuid}/spaces/${spaceUuid}`}
                                    fz={12}
                                    fw={500}
                                >
                                    {spaceName}
                                </Anchor>
                            </InfoRow>
                        )}

                        {latestVersion && (
                            <Group gap={6} wrap="nowrap">
                                <MantineIcon
                                    icon={IconHistory}
                                    color="ldGray.6"
                                    size={14}
                                />
                                <Text fz="xs" c="ldGray.6" fw={600}>
                                    Version {latestVersion.number} (
                                    {versionStatusLabel(latestVersion.status)})
                                </Text>
                            </Group>
                        )}

                        {withChartData && (
                            <DashboardList
                                resourceItemId={resourceUuid}
                                projectUuid={projectUuid}
                            />
                        )}

                        {shouldShowDivider && <Divider mb={4} />}

                        {slug && (
                            <InfoRow icon={IconHash} label="Slug">
                                <CopyButton value={slug}>
                                    {({ copied, copy }) => (
                                        <Tooltip
                                            position="top-start"
                                            label={
                                                copied
                                                    ? 'Copied slug'
                                                    : 'Copy slug'
                                            }
                                            withArrow
                                        >
                                            <UnstyledButton onClick={copy}>
                                                <Group gap={6} wrap="nowrap">
                                                    <Text
                                                        fz={11}
                                                        fw={500}
                                                        c="ldGray.9"
                                                        ff="monospace"
                                                    >
                                                        {slug}
                                                    </Text>
                                                    <MantineIcon
                                                        icon={
                                                            copied
                                                                ? IconCheck
                                                                : IconCopy
                                                        }
                                                        color="ldGray.6"
                                                        size="sm"
                                                    />
                                                </Group>
                                            </UnstyledButton>
                                        </Tooltip>
                                    )}
                                </CopyButton>
                            </InfoRow>
                        )}
                    </Stack>
                </Stack>
            </HoverCard.Dropdown>
        </HoverCard>
    );
};
