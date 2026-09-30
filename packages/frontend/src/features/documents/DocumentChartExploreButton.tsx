import { ChartType, type CreateSavedChartVersion } from '@lightdash/common';
import { Button, Stack } from '@mantine/core';
import { IconTelescope } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import Callout from '../../components/common/Callout';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import { useCreateShareMutation } from '../../hooks/useShare';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';

type Props = {
    projectUuid: string;
    documentUuid: string;
    chart: CreateSavedChartVersion;
};

const DocumentChartExploreButton = ({
    projectUuid,
    documentUuid,
    chart,
}: Props) => {
    const navigate = useNavigate();
    const { track } = useTracking();
    const share = useCreateShareMutation();
    const { clearDashboardStorage } = useDashboardStorage();

    const handleExplore = () => {
        track({
            name: EventName.DOCUMENT_CHART_EXPLORE_CLICKED,
            properties: {
                projectUuid,
                documentUuid,
                chartType: chart.chartConfig.type,
                isCustomChart:
                    chart.chartConfig.type === ChartType.DATA_APP_VIZ,
            },
        });
        const url = getExplorerUrlFromCreateSavedChartVersion(
            projectUuid,
            chart,
            true,
        );
        share.mutate(
            { path: url.pathname, params: `?${url.search}` },
            {
                onSuccess: ({ nanoid }) => {
                    clearDashboardStorage();
                    void navigate(`/share/${nanoid}`);
                },
            },
        );
    };

    return (
        <Stack gap="xs" align="flex-end">
            <Button
                size="xs"
                variant="default"
                leftSection={<MantineIcon icon={IconTelescope} />}
                loading={share.isLoading}
                onClick={handleExplore}
            >
                Explore from here
            </Button>
            {share.error && (
                <Callout variant="danger">{share.error.error.message}</Callout>
            )}
        </Stack>
    );
};

export default DocumentChartExploreButton;
