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
    ActionIcon,
    Popover,
    useMatches,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
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
import { type TFunction } from 'i18next';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useOptionalProjectRoute } from '../../../hooks/useProjectRoute';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import MantineIcon from '../MantineIcon';
import InfoRow from '../PageHeader/InfoRow';
import ViewsCountPopover from '../ViewsCountPopover';
import { DashboardList } from './DashboardList';
import styles from './ResourceInfoPopup.module.css';

const versionStatusLabel = (
    status: AppVersionStatus,
    t: TFunction<'commonUi'>,
): string => {
    if (status === 'error') return t('resourceInfo.versionStatus.error');
    if (status === 'ready') return t('resourceInfo.versionStatus.ready');
    if (isAppVersionInProgress(status))
        return t('resourceInfo.versionStatus.building');
    return status;
};

export type ResourceInfoPopupProps = {
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
    viewStatsResourceType?: 'chart' | 'dashboard';
    firstViewedAt?: Date | string | null;
    latestVersion?: { number: number; status: AppVersionStatus } | null;
};

const hasResourceInfoContent = ({
    title,
    description,
    slug,
    withChartData = false,
    updatedAt,
    viewStats,
    spaceName,
    spaceUuid,
    latestVersion,
}: ResourceInfoPopupProps) =>
    !!title ||
    !!description ||
    !!slug ||
    !!withChartData ||
    !!updatedAt ||
    viewStats !== undefined ||
    !!(spaceName && spaceUuid) ||
    !!latestVersion;

export const ResourceInfoPopupContent: FC<ResourceInfoPopupProps> = ({
    resourceUuid,
    title,
    description,
    slug,
    updatedAt,
    spaceName,
    spaceUuid,
    projectUuid,
    viewStats,
    viewStatsResourceType,
    firstViewedAt,
    withChartData = false,
    latestVersion,
}) => {
    const { t } = useTranslation('commonUi');
    const projectRoute = useOptionalProjectRoute();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? projectUuid;
    const timeAgo = useTimeAgo(updatedAt ?? new Date());
    const label =
        firstViewedAt && viewStats
            ? t('resourceInfo.viewsSince', {
                  count: viewStats,
                  date: dayjs(firstViewedAt).format('MMM D, YYYY h:mm A'),
              })
            : undefined;
    const hasMetadataRows =
        !!updatedAt ||
        viewStats !== undefined ||
        !!(spaceName && spaceUuid) ||
        !!latestVersion;
    const shouldShowDivider =
        !!slug && (hasMetadataRows || !!description || withChartData);
    if (
        !hasResourceInfoContent({
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
            withChartData,
            latestVersion,
        })
    )
        return null;

    return (
        <Stack gap="sm">
            {(title || description) && (
                <Box>
                    {title && (
                        <Text fz="sm" fw={600} mb={4}>
                            {title}
                        </Text>
                    )}
                    {description && (
                        <Text fz="xs" c="dimmed" className={styles.preLineText}>
                            {description}
                        </Text>
                    )}
                </Box>
            )}

            <Stack gap={10}>
                {updatedAt && (
                    <InfoRow
                        icon={IconClock}
                        label={t('resourceInfo.lastModified')}
                    >
                        {timeAgo}
                    </InfoRow>
                )}

                {viewStats !== undefined ? (
                    <InfoRow icon={IconEye} label={t('resourceInfo.views')}>
                        <ViewsCountPopover
                            resourceType={viewStatsResourceType}
                            resourceUuid={resourceUuid}
                            projectUuid={projectUuid}
                            views={viewStats}
                            fallbackTooltip={label}
                        >
                            {viewStats.toLocaleString()}
                        </ViewsCountPopover>
                    </InfoRow>
                ) : null}

                {spaceName && spaceUuid && (
                    <InfoRow icon={IconFolder} label={t('resourceInfo.space')}>
                        <Anchor
                            component={Link}
                            to={`/projects/${projectUrlIdentifier}/spaces/${spaceUuid}`}
                            fz="xs"
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
                            color="dimmed"
                            size={14}
                        />
                        <Text fz="xs" c="dimmed" fw={600}>
                            {t('resourceInfo.versionWithStatus', {
                                number: latestVersion.number,
                                status: versionStatusLabel(
                                    latestVersion.status,
                                    t,
                                ),
                            })}
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
                    <InfoRow icon={IconHash} label={t('resourceInfo.slug')}>
                        <CopyButton value={slug}>
                            {({ copied, copy }) => (
                                <Tooltip
                                    position="top-start"
                                    label={
                                        copied
                                            ? t('resourceInfo.copiedSlug')
                                            : t('resourceInfo.copySlug')
                                    }
                                >
                                    <UnstyledButton onClick={copy}>
                                        <Group gap={6} wrap="nowrap">
                                            <Text
                                                fz="xs"
                                                fw={500}
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
                                                color="dimmed"
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
    );
};

export const ResourceInfoPopup: FC<ResourceInfoPopupProps> = (props) => {
    const { t } = useTranslation('commonUi');
    const compact = useMatches(
        { base: true, sm: false },
        { getInitialValueInEffect: false },
    );
    const [opened, { toggle, close }] = useDisclosure(false);
    if (!hasResourceInfoContent(props)) return null;

    if (compact)
        return (
            <Popover
                opened={opened}
                onClose={close}
                width="min(320px, calc(100vw - 24px))"
                position="bottom"
                withArrow
            >
                <Popover.Target>
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="lg"
                        aria-label={t('resourceInfo.contentDetails')}
                        aria-expanded={opened}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            toggle();
                        }}
                    >
                        <MantineIcon icon={IconInfoCircle} />
                    </ActionIcon>
                </Popover.Target>
                <Popover.Dropdown>
                    <ResourceInfoPopupContent {...props} />
                </Popover.Dropdown>
            </Popover>
        );

    return (
        <HoverCard offset={-1} position="bottom">
            <HoverCard.Target>
                <MantineIcon icon={IconInfoCircle} color="dimmed" />
            </HoverCard.Target>
            <HoverCard.Dropdown
                w={320}
                p="md"
                className={styles.resourceInfoOverlay}
            >
                <ResourceInfoPopupContent {...props} />
            </HoverCard.Dropdown>
        </HoverCard>
    );
};
