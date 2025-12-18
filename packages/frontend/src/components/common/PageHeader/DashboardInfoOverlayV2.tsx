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
import styles from './DashboardInfoOverlayV2.module.css';
import InfoRowV2 from './InfoRowV2';

type DashboardInfoOverlayV2Props = {
    dashboard: Dashboard;
    projectUuid: string | undefined;
};

const DashboardInfoOverlayV2: FC<DashboardInfoOverlayV2Props> = ({
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
                <InfoRowV2 icon={IconClock} label="Last modified">
                    {timeAgo}
                </InfoRowV2>

                <InfoRowV2 icon={IconEye} label="Views">
                    {(dashboard.views ?? 0).toLocaleString()}
                </InfoRowV2>

                {dashboard.spaceName && (
                    <InfoRowV2 icon={IconFolder} label="Space">
                        <Anchor
                            component={Link}
                            to={`/projects/${projectUuid}/spaces/${dashboard.spaceUuid}`}
                            fz={12}
                            fw={500}
                        >
                            {dashboard.spaceName}
                        </Anchor>
                    </InfoRowV2>
                )}

                <Divider mb={4} />

                <InfoRowV2 icon={IconHash} label="Slug">
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
                </InfoRowV2>
            </Stack>
        </Stack>
    );
};

export default DashboardInfoOverlayV2;
