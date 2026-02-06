import { Button, Menu } from '@mantine-8/core';
import { IconHash } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { Link, useNavigate } from 'react-router';
import { useProject } from '../../hooks/useProject';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';

interface Props {
    projectUuid: string;
    asMenu?: boolean;
}

export const MetricsLink: FC<Props> = ({ projectUuid, asMenu }) => {
    const { user } = useApp();
    const navigate = useNavigate();
    const { data: project } = useProject(projectUuid);
    const { track } = useTracking();

    const trackMetricsCatalogClick = useCallback(() => {
        if (project) {
            track({
                name: EventName.METRICS_CATALOG_CLICKED,
                properties: {
                    userId: user?.data?.userUuid,
                    organizationId: project.organizationUuid,
                    projectId: projectUuid,
                },
            });
        }
    }, [project, projectUuid, track, user]);

    const handleMetricsCatalogClick = useCallback(() => {
        trackMetricsCatalogClick();
        void navigate(`/projects/${projectUuid}/metrics`);
    }, [trackMetricsCatalogClick, navigate, projectUuid]);

    if (asMenu) {
        return (
            <Menu.Item
                component={Link}
                to={`/projects/${projectUuid}/metrics`}
                leftSection={<MantineIcon icon={IconHash} />}
                onClick={trackMetricsCatalogClick}
            >
                Metrics
            </Menu.Item>
        );
    }

    return (
        <Button
            variant="default"
            size="xs"
            fz="sm"
            leftSection={<MantineIcon icon={IconHash} color="ldGray.6" />}
            onClick={handleMetricsCatalogClick}
        >
            Metrics
        </Button>
    );
};
