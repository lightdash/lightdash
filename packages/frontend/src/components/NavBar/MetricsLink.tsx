import { Button, Menu } from '@mantine/core';
import { IconHash } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { Link, useNavigate } from 'react-router';
import { useProject } from '../../hooks/useProject';
import useTracking from '../../providers/Tracking/useTracking';
import { Hash } from '../../svgs/metricsCatalog';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';

interface Props {
    projectUuid: string;
    asMenu?: boolean;
}

export const MetricsLink: FC<Props> = ({ projectUuid, asMenu }) => {
    const navigate = useNavigate();
    const { data: project } = useProject(projectUuid);
    const { track } = useTracking();

    const handleMetricsCatalogClick = useCallback(() => {
        if (project) {
            track({
                name: EventName.METRICS_CATALOG_CLICKED,
                properties: {
                    organizationId: project.organizationUuid,
                    projectId: projectUuid,
                },
            });
        }
        void navigate(`/projects/${projectUuid}/metrics`);
    }, [project, projectUuid, track, navigate]);

    if (asMenu) {
        return (
            <Menu.Item
                component={Link}
                to={`/projects/${projectUuid}/metrics`}
                icon={<MantineIcon icon={IconHash} />}
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
            leftIcon={<Hash />}
            onClick={handleMetricsCatalogClick}
        >
            Metrics
        </Button>
    );
};
