import { Anchor, Box, List, Loader, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboardsContainingChart } from '../../../hooks/dashboard/useDashboards';

type Props = {
    resourceItemId: string;
    projectUuid: string;
};

export const DashboardList: FC<Props> = ({ resourceItemId, projectUuid }) => {
    const { t } = useTranslation('commonUi');
    const { data: relatedDashboards } = useDashboardsContainingChart(
        projectUuid,
        resourceItemId,
    );
    return (
        <Box>
            {relatedDashboards ? (
                <Text fw={600} fz="xs" c="dimmed">
                    {relatedDashboards.length > 0
                        ? t('resourceInfo.usedInDashboardsList', {
                              count: relatedDashboards.length,
                          })
                        : t('resourceInfo.usedInDashboards', {
                              count: relatedDashboards.length,
                          })}
                </Text>
            ) : (
                <Loader color="gray" size="xs" />
            )}
            {!!relatedDashboards?.length && (
                <List size="xs">
                    {relatedDashboards.map(({ uuid, slug, name }) => (
                        <List.Item key={uuid}>
                            <Anchor
                                href={`${window.location.origin}/projects/${projectUuid}/dashboards/${slug}/view/`}
                                target="_blank"
                                onClick={(
                                    e: React.MouseEvent<HTMLAnchorElement>,
                                ) => e.stopPropagation()}
                                fz="xs"
                            >
                                {name}
                            </Anchor>
                        </List.Item>
                    ))}
                </List>
            )}
        </Box>
    );
};
