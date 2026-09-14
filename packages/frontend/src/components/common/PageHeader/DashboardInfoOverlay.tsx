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
} from '@mantine/core';
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
import { useOptionalProjectRoute } from '../../../hooks/useProjectRoute';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import MantineIcon from '../MantineIcon';
import ViewsCountPopover from '../ViewsCountPopover';
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
    const projectRoute = useOptionalProjectRoute();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? projectUuid;

    return (
        <Stack gap="sm" w={320} p="md" className={styles.dashboardInfoOverlay}>
            <Box>
                <Text fz="sm" fw={600} mb={4}>
                    {dashboard.name}
                </Text>
                {dashboard.description && (
                    <Text fz="xs" c="dimmed">
                        {dashboard.description}
                    </Text>
                )}
            </Box>

            <Stack gap={10}>
                {dashboard.owner && (
                    <InfoRow icon={IconUser} label="Owner">
                        {`${dashboard.owner.firstName} ${dashboard.owner.lastName}`.trim() ||
                            dashboard.owner.email}
                    </InfoRow>
                )}

                <InfoRow icon={IconClock} label="Last modified">
                    {timeAgo}
                </InfoRow>

                <InfoRow icon={IconEye} label="Views">
                    <ViewsCountPopover
                        resourceType="dashboard"
                        resourceUuid={dashboard.uuid}
                        projectUuid={projectUuid}
                        views={dashboard.views ?? 0}
                    >
                        {(dashboard.views ?? 0).toLocaleString()}
                    </ViewsCountPopover>
                </InfoRow>

                {dashboard.spaceName && (
                    <InfoRow icon={IconFolder} label="Space">
                        <Anchor
                            component={Link}
                            to={`/projects/${projectUrlIdentifier}/spaces/${dashboard.spaceUuid}`}
                            fz="xs"
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
                                    <Text fz="xs" fw={500} ff="monospace">
                                        {dashboard.slug}
                                    </Text>
                                    <MantineIcon
                                        icon={copied ? IconCheck : IconCopy}
                                        color="dimmed"
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
