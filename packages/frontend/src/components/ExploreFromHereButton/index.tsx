import { subject } from '@casl/ability';
import { Button, Menu } from '@mantine/core';
import { IconTelescope } from '@tabler/icons-react';
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
    selectSavedChart,
    useExplorerSelector,
} from '../../features/explorer/store';
import { getExploreFromHereUrl } from '../../features/mergeQuery/utils/getExploreFromHereUrl';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useContentAuthoringEnabled } from '../../hooks/useContentAuthoringEnabled';
import { useCreateShareMutation } from '../../hooks/useShare';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';

const ExploreFromHereButton = ({
    asMenuItem = false,
}: {
    asMenuItem?: boolean;
}) => {
    // Get savedChart from Redux
    const authoringEnabled = useContentAuthoringEnabled();
    const savedChart = useExplorerSelector(selectSavedChart);
    const exploreFromHereUrl = useMemo(
        () => (savedChart ? getExploreFromHereUrl(savedChart) : undefined),
        [savedChart],
    );

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
    if (!authoringEnabled || cannotManageExplore) return null;
    if (!exploreFromHereUrl) return null;

    const actionProps = {
        leftSection: <MantineIcon icon={IconTelescope} />,
        onClick: () => void handleCreateShareUrl(),
    };

    return asMenuItem ? (
        <Menu.Item {...actionProps}>Explore from here</Menu.Item>
    ) : (
        <Button size="xs" {...actionProps}>
            Explore from here
        </Button>
    );
};

export default ExploreFromHereButton;
