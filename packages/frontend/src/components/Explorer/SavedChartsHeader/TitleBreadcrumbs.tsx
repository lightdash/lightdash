import { ActionIcon, Anchor, Group, Text, Tooltip } from '@mantine/core';
import { IconFolder } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    projectUuid: string;
    spaceUuid: string | null;
    spaceName: string | null;
    dashboardUuid?: string | null;
    dashboardName?: string | null;
};

const MAX_WIDTH_TITLE_PX = 160;

const SlashDivider = () => (
    <Text span c="ldGray.8">
        /
    </Text>
);

export const TitleBreadCrumbs: FC<Props> = ({
    projectUuid,
    spaceUuid,
    spaceName,
    dashboardUuid,
    dashboardName,
}) => {
    const isChartWithinDashboard = !!(dashboardUuid && dashboardName);
    return (
        <>
            {spaceName && spaceUuid ? (
                <>
                    <Group spacing="xs">
                        <Tooltip
                            maw={300}
                            multiline
                            withinPortal
                            position="bottom"
                            label={
                                <Text fz="xs">
                                    Space:{' '}
                                    <Text span fw={500}>
                                        {spaceName}
                                    </Text>
                                </Text>
                            }
                        >
                            {isChartWithinDashboard ? (
                                <ActionIcon
                                    variant="subtle"
                                    component={Link}
                                    to={`/projects/${projectUuid}/dashboards/${dashboardUuid}`}
                                >
                                    <MantineIcon
                                        color="ldGray.4"
                                        icon={IconFolder}
                                    />
                                </ActionIcon>
                            ) : (
                                <Anchor
                                    fw={500}
                                    fz="md"
                                    c="ldGray.6"
                                    component={Link}
                                    to={`/projects/${projectUuid}/spaces/${spaceUuid}`}
                                    sx={{
                                        maxWidth: `${MAX_WIDTH_TITLE_PX}px`,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        display: 'inline-block',
                                    }}
                                >
                                    {spaceName}
                                </Anchor>
                            )}
                        </Tooltip>
                    </Group>
                    <SlashDivider />
                </>
            ) : null}
            {isChartWithinDashboard ? (
                <>
                    <Tooltip
                        maw={300}
                        multiline
                        withinPortal
                        position="bottom"
                        label={
                            <Text fz="xs">
                                Dashboard:{' '}
                                <Text span fw={500}>
                                    {dashboardName}
                                </Text>
                            </Text>
                        }
                    >
                        <Anchor
                            fw={500}
                            c="ldGray.6"
                            fz="md"
                            component={Link}
                            to={`/projects/${projectUuid}/dashboards/${dashboardUuid}`}
                            sx={{
                                maxWidth: `${MAX_WIDTH_TITLE_PX}px`,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: 'inline-block',
                            }}
                        >
                            {dashboardName}
                        </Anchor>
                    </Tooltip>

                    <SlashDivider />
                </>
            ) : null}
        </>
    );
};
