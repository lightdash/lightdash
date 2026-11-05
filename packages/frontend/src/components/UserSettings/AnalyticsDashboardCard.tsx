import {
    ResourceViewItemType,
    type DashboardBasicDetails,
} from '@lightdash/common';
import { Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { Link } from 'react-router';
import MantineIcon from '../common/MantineIcon';
import { PolymorphicPaperButton } from '../common/PolymorphicPaperButton';
import { ResourceIcon } from '../common/ResourceIcon';
import { ResourceVerifiedInlineBadge } from '../common/ResourceView/InfiniteResourceTableColumnName';
import classes from './AnalyticsDashboardCard.module.css';

const AnalyticsDashboardCard = ({
    dashboard,
    projectUrlIdentifier,
}: {
    dashboard: DashboardBasicDetails;
    projectUrlIdentifier: string;
}) => (
    <PolymorphicPaperButton
        component={Link}
        to={`/projects/${projectUrlIdentifier}/dashboards/${dashboard.slug}/view`}
        aria-label={
            dashboard.verification
                ? `${dashboard.name}, verified`
                : dashboard.name
        }
        className={classes.card}
    >
        <Stack gap="sm" p="md" className={classes.content}>
            <Group gap="sm" wrap="nowrap">
                <ResourceIcon
                    item={{
                        type: ResourceViewItemType.DASHBOARD,
                        data: dashboard,
                    }}
                />
                <Group gap="xs" wrap="nowrap">
                    <Tooltip label={dashboard.name} multiline maw={300}>
                        <Text fw={600} fz="sm" lineClamp={2}>
                            {dashboard.name}
                        </Text>
                    </Tooltip>
                    <ResourceVerifiedInlineBadge
                        verification={dashboard.verification}
                    />
                </Group>
            </Group>
            {dashboard.description && (
                <Tooltip label={dashboard.description} multiline maw={400}>
                    <Text fz="sm" c="dimmed" lineClamp={3}>
                        {dashboard.description}
                    </Text>
                </Tooltip>
            )}
        </Stack>
        <Group
            justify="space-between"
            gap="xs"
            px="md"
            py="xs"
            className={classes.footer}
        >
            <Text fz="xs" c="dimmed">
                Updated {new Date(dashboard.updatedAt).toLocaleDateString()}
            </Text>
            <MantineIcon icon={IconArrowRight} color="dimmed" />
        </Group>
    </PolymorphicPaperButton>
);

export default AnalyticsDashboardCard;
