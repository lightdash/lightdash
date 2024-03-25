import { Anchor, Group, Text, Tooltip } from '@mantine/core';
import { IconFolder, IconLayoutDashboard } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router-dom';
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
    <Text span c="dark.3">
        /
    </Text>
);

export const TitleBreadCrumbs: FC<Props> = ({
    projectUuid,
    spaceUuid,
    spaceName,
    dashboardUuid,
    dashboardName,
}) => (
    <>
        {spaceName && spaceUuid ? (
            <>
                <Group spacing="xs">
                    <Tooltip
                        withinPortal
                        disabled={!(dashboardUuid && dashboardName)}
                        label={spaceName}
                    >
                        <MantineIcon color="dark.2" icon={IconFolder} />
                    </Tooltip>
                    {dashboardUuid && dashboardName ? null : (
                        <Anchor
                            title={spaceName}
                            fw={600}
                            c="dark.2"
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
                </Group>
                <SlashDivider />
            </>
        ) : null}
        {dashboardUuid && dashboardName ? (
            <>
                <Group spacing="xs">
                    <MantineIcon color="dark.2" icon={IconLayoutDashboard} />
                    <Anchor
                        title={dashboardName}
                        fw={600}
                        c="dark.2"
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
                </Group>

                <SlashDivider />
            </>
        ) : null}
    </>
);
