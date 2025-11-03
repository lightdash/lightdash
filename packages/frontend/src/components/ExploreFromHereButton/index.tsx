import { subject } from '@casl/ability';
import { Button } from '@mantine/core';
import { IconTelescope } from '@tabler/icons-react';
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
    selectSavedChart,
    useExplorerSelector,
} from '../../features/explorer/store';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import { useCreateShareMutation } from '../../hooks/useShare';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';

const ExploreFromHereButton = () => {
    // Get savedChart from Redux
    const savedChart = useExplorerSelector(selectSavedChart);
    const exploreFromHereUrl = useMemo(() => {
        if (savedChart) {
            return getExplorerUrlFromCreateSavedChartVersion(
                savedChart.projectUuid,
                savedChart,
                true,
            );
        }
    }, [savedChart]);

    const { user } = useApp();
    const navigate = useNavigate();
    const { mutateAsync: createShareUrl } = useCreateShareMutation();
    const { clearDashboardStorage } = useDashboardStorage();

    const handleCreateShareUrl = useCallback(async () => {
        if (!exploreFromHereUrl) return;

        const shareUrl = await createShareUrl({
            path: exploreFromHereUrl.pathname,
            params: `?` + exploreFromHereUrl.search,
        });

        // Clear dashboard storage to prevent banner from showing when `exploring from here` on a chart from a dashboard
        clearDashboardStorage();

        void navigate(`/share/${shareUrl.nanoid}`);
    }, [clearDashboardStorage, createShareUrl, exploreFromHereUrl, navigate]);

    const cannotManageExplore = user.data?.ability.cannot(
        'manage',
        subject('Explore', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid: savedChart?.projectUuid,
        }),
    );
    if (cannotManageExplore) return null;
    if (!exploreFromHereUrl) return null;

    return (
        <Button
            size="xs"
            leftIcon={<MantineIcon icon={IconTelescope} />}
            onClick={() => handleCreateShareUrl()}
        >
            Explore from here
        </Button>
    );
};

export default ExploreFromHereButton;
