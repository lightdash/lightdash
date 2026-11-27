import { Button, Menu } from '@mantine/core';
import { IconHash } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { Link, useNavigate } from 'react-router';
import { useProject } from '../../hooks/useProject';
import { getProjectUrlIdentifier } from '../../utils/projectUrl';
import MantineIcon from '../common/MantineIcon';
import {
    useCanViewMetrics,
    useTrackMetricsCatalogClick,
} from './useDestinationAccess';

interface Props {
    projectUuid: string;
    asMenu?: boolean;
}

export const MetricsLink: FC<Props> = ({ projectUuid, asMenu }) => {
    const navigate = useNavigate();
    const { data: project } = useProject(projectUuid);
    const projectUrlIdentifier = project
        ? getProjectUrlIdentifier(project)
        : projectUuid;
    const canViewMetrics = useCanViewMetrics(projectUuid);
    const trackMetricsCatalogClick = useTrackMetricsCatalogClick(projectUuid);

    const handleMetricsCatalogClick = useCallback(() => {
        trackMetricsCatalogClick();
        void navigate(`/projects/${projectUrlIdentifier}/metrics`);
    }, [trackMetricsCatalogClick, navigate, projectUrlIdentifier]);

    if (!canViewMetrics) return null;

    if (asMenu) {
        return (
            <Menu.Item
                component={Link}
                to={`/projects/${projectUrlIdentifier}/metrics`}
                leftSection={<MantineIcon icon={IconHash} />}
                onClick={trackMetricsCatalogClick}
                // Walkthrough anchor (data-tour-via); the same one on the
                // bar button below, whichever the catalog shows.
                data-tour-nav="metrics"
                data-tour-hint="Open Metrics"
            >
                Metrics
            </Menu.Item>
        );
    }

    return (
        <Button
            aria-label="Metrics"
            variant="default"
            size="xs"
            fz="sm"
            leftSection={<MantineIcon icon={IconHash} color="dimmed" />}
            onClick={handleMetricsCatalogClick}
            data-tour-nav="metrics"
            data-tour-hint="Open Metrics"
        >
            Metrics
        </Button>
    );
};
