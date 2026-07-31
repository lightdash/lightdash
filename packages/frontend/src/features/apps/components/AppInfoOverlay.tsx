import {
    Anchor,
    Box,
    CopyButton,
    Divider,
    Group,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine-8/core';
import {
    IconCheck,
    IconClock,
    IconCopy,
    IconEye,
    IconFolder,
    IconHash,
    IconUser,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import InfoRow from '../../../components/common/PageHeader/InfoRow';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import styles from './AppInfoOverlay.module.css';

type Props = {
    projectUuid: string;
    displayName: string;
    description: string | null;
    spaceUuid: string | null;
    spaceName: string | null;
    /** Timestamp of the latest build activity; null when never built. */
    lastModified: Date | null;
    views: number | null;
    slug: string | null;
};

/** Own component so the timeAgo hook runs unconditionally. */
const LastModifiedRow: FC<{ date: Date }> = ({ date }) => {
    const timeAgo = useTimeAgo(date);
    return (
        <InfoRow icon={IconClock} label="Last modified">
            {timeAgo}
        </InfoRow>
    );
};

/**
 * Popover content behind the app header's info icon — mirrors the dashboard's
 * `DashboardInfoOverlay` so both content types present their metadata the
 * same way.
 */
const AppInfoOverlay: FC<Props> = ({
    projectUuid,
    displayName,
    description,
    spaceUuid,
    spaceName,
    lastModified,
    views,
    slug,
}) => (
    <Stack gap="sm" w={320} p="md" className={styles.appInfoOverlay}>
        <Box>
            <Text fz="sm" fw={600} c="ldGray.9" mb={4}>
                {displayName}
            </Text>
            {description && (
                <Text fz="xs" c="dimmed">
                    {description}
                </Text>
            )}
        </Box>

        <Stack gap={10}>
            {lastModified && <LastModifiedRow date={lastModified} />}

            {views !== null && (
                <InfoRow icon={IconEye} label="Views">
                    {views.toLocaleString()}
                </InfoRow>
            )}

            {spaceUuid ? (
                <InfoRow icon={IconFolder} label="Space">
                    <Anchor
                        component={Link}
                        to={`/projects/${projectUuid}/spaces/${spaceUuid}`}
                        fz={12}
                        fw={500}
                    >
                        {spaceName ?? 'Space'}
                    </Anchor>
                </InfoRow>
            ) : (
                <InfoRow icon={IconUser} label="Space">
                    Personal
                </InfoRow>
            )}

            {slug && (
                <>
                    <Divider mb={4} />

                    <InfoRow icon={IconHash} label="Slug">
                        <CopyButton value={slug}>
                            {({ copied, copy }) => (
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
                                            icon={copied ? IconCheck : IconCopy}
                                            color="ldGray.6"
                                            size="sm"
                                        />
                                    </Group>
                                </UnstyledButton>
                            )}
                        </CopyButton>
                    </InfoRow>
                </>
            )}
        </Stack>
    </Stack>
);

export default AppInfoOverlay;
