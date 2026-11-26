import { ActionIcon, Anchor, Group, Text, Tooltip } from '@mantine/core';
import { IconFolder } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import { useOptionalProjectRoute } from '../../../hooks/useProjectRoute';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    projectUuid: string;
    spaceUuid: string | null;
    spaceName: string | null;
    dashboardUuid?: string | null;
    dashboardSlug?: string | null;
    dashboardName?: string | null;
    /** Matches the size of the title the crumbs sit beside. */
    size?: 'sm' | 'md';
};

const MAX_WIDTH_TITLE_PX = 160;

const SlashDivider: FC<{ size: 'sm' | 'md' }> = ({ size }) => (
    <Text
        span
        fz={size === 'sm' ? 'sm' : undefined}
        c={size === 'sm' ? 'dimmed' : undefined}
    >
        /
    </Text>
);

export const TitleBreadCrumbs: FC<Props> = ({
    projectUuid,
    spaceUuid,
    spaceName,
    dashboardUuid,
    dashboardSlug,
    dashboardName,
    size = 'md',
}) => {
    const projectRoute = useOptionalProjectRoute();
    const spacesQuery = useSpaceSummaries(projectUuid, true);
    const canAccessSpace =
        !spacesQuery.isError &&
        spacesQuery.data?.some((space) => space.uuid === spaceUuid);
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? projectUuid;
    const isChartWithinDashboard = !!(dashboardUuid && dashboardName);
    return (
        <>
            {spaceName && spaceUuid ? (
                <>
                    <Group gap="xs">
                        <Tooltip
                            maw={300}
                            position="bottom"
                            label={
                                <Text fz="xs">
                                    Space:{' '}
                                    <Text span fz="xs" fw="bold">
                                        {spaceName}
                                    </Text>
                                </Text>
                            }
                        >
                            {isChartWithinDashboard ? (
                                <ActionIcon
                                    component={Link}
                                    to={`/projects/${projectUrlIdentifier}/dashboards/${dashboardSlug ?? dashboardUuid}`}
                                >
                                    <MantineIcon
                                        color="ldGray.4"
                                        icon={IconFolder}
                                    />
                                </ActionIcon>
                            ) : canAccessSpace ? (
                                <Anchor
                                    fw={500}
                                    fz={size}
                                    c="dimmed"
                                    component={Link}
                                    to={`/projects/${projectUrlIdentifier}/spaces/${spaceUuid}`}
                                    truncate
                                    maw={MAX_WIDTH_TITLE_PX}
                                    display="inline-block"
                                >
                                    {spaceName}
                                </Anchor>
                            ) : (
                                <Text
                                    fw={500}
                                    fz={size}
                                    c="dimmed"
                                    truncate
                                    maw={MAX_WIDTH_TITLE_PX}
                                >
                                    {spaceName}
                                </Text>
                            )}
                        </Tooltip>
                    </Group>
                    <SlashDivider size={size} />
                </>
            ) : null}
            {isChartWithinDashboard ? (
                <>
                    <Tooltip
                        maw={300}
                        position="bottom"
                        label={
                            <Text fz="xs">
                                Dashboard:{' '}
                                <Text span fz="xs" fw="bold">
                                    {dashboardName}
                                </Text>
                            </Text>
                        }
                    >
                        <Anchor
                            fw={500}
                            c="dimmed"
                            fz={size}
                            component={Link}
                            to={`/projects/${projectUrlIdentifier}/dashboards/${dashboardSlug ?? dashboardUuid}`}
                            truncate
                            display="inline-block"
                            maw={MAX_WIDTH_TITLE_PX}
                        >
                            {dashboardName}
                        </Anchor>
                    </Tooltip>

                    <SlashDivider size={size} />
                </>
            ) : null}
        </>
    );
};
