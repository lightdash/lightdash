import { type Dashboard } from '@lightdash/common';
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
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import MantineIcon from '../MantineIcon';
import styles from './DashboardInfoOverlay.module.css';
import InfoRow from './InfoRow';

type DashboardInfoOverlayProps = {
    dashboard: Dashboard;
    projectUuid: string | undefined;
};

const DashboardInfoOverlay: FC<DashboardInfoOverlayProps> = ({
    dashboard,
    projectUuid,
}) => {
    const timeAgo = useTimeAgo(dashboard.updatedAt);

    return (
        <Stack gap="sm" w={320} p="md" className={styles.dashboardInfoOverlay}>
            <Box>
                <Text fz="sm" fw={600} c="ldGray.9" mb={4}>
                    {dashboard.name}
                </Text>
                {dashboard.description && (
                    <Text fz="xs" c="dimmed">
                        {dashboard.description}
                    </Text>
                )}
            </Box>

            <Stack gap={10}>
                <InfoRow icon={IconClock} label="Last modified">
                    {timeAgo}
                </InfoRow>

                <InfoRow icon={IconEye} label="Views">
                    {(dashboard.views ?? 0).toLocaleString()}
                </InfoRow>

                {dashboard.spaceName && (
                    <InfoRow icon={IconFolder} label="Space">
                        <Anchor
                            component={Link}
                            to={`/projects/${projectUuid}/spaces/${dashboard.spaceUuid}`}
                            fz={12}
                            fw={500}
                        >
                            {dashboard.spaceName}
                        </Anchor>
                    </InfoRow>
                )}

                <Divider mb={4} />

                <InfoRow icon={IconHash} label="Slug">
                    <CopyButton value={dashboard.slug}>
                        {({ copied, copy }) => (
                            <UnstyledButton onClick={copy}>
                                <Group gap={6} wrap="nowrap">
                                    <Text
                                        fz={11}
                                        fw={500}
                                        c="ldGray.9"
                                        ff="monospace"
                                    >
                                        {dashboard.slug}
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
            </Stack>
        </Stack>
    );
};

export default DashboardInfoOverlay;
