import { type CreateSavedChartVersion } from '@lightdash/common';
import { Button, Stack } from '@mantine/core';
import { IconTelescope } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import Callout from '../../components/common/Callout';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import { useCreateShareMutation } from '../../hooks/useShare';

type Props = {
    projectUuid: string;
    chart: CreateSavedChartVersion;
};

const DocumentChartExploreButton = ({ projectUuid, chart }: Props) => {
    const navigate = useNavigate();
    const share = useCreateShareMutation();
    const { clearDashboardStorage } = useDashboardStorage();

    const handleExplore = () => {
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
