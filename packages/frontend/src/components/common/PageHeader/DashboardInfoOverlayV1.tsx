import { type Dashboard } from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import SlugInfo from './SlugInfo';
import SpaceAndDashboardInfo from './SpaceAndDashboardInfo';
import { UpdatedInfo } from './UpdatedInfo';
import ViewInfo from './ViewInfo';

type DashboardInfoOverlayV1Props = {
    dashboard: Dashboard;
    projectUuid: string | undefined;
};

const DashboardInfoOverlayV1: FC<DashboardInfoOverlayV1Props> = ({
    dashboard,
    projectUuid,
}) => {
    return (
        <Stack spacing="xs" py="md" px="sm">
            {dashboard.description && (
                <Text
                    fz="xs"
                    color="ldGray.7"
                    fw={500}
                    style={{ whiteSpace: 'pre-line' }}
                >
                    {dashboard.description}
                </Text>
            )}

            <UpdatedInfo
                updatedAt={dashboard.updatedAt}
                user={dashboard.updatedByUser}
            />

            <ViewInfo
                views={dashboard.views}
                firstViewedAt={dashboard.firstViewedAt}
            />

            <SlugInfo slug={dashboard.slug} />

            {dashboard.spaceName && (
                <SpaceAndDashboardInfo
                    space={{
                        link: `/projects/${projectUuid}/spaces/${dashboard.spaceUuid}`,
                        name: dashboard.spaceName,
                    }}
                />
            )}
        </Stack>
    );
};

export default DashboardInfoOverlayV1;
