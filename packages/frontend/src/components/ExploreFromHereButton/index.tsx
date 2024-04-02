import { subject } from '@casl/ability';
import { Button } from '@mantine/core';
import { IconTelescope } from '@tabler/icons-react';
import { useCallback, useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import { useCreateShareMutation } from '../../hooks/useShare';
import { useApp } from '../../providers/AppProvider';
import { useExplorerContext } from '../../providers/ExplorerProvider';
import MantineIcon from '../common/MantineIcon';

const ExploreFromHereButton = () => {
    const savedChart = useExplorerContext(
        (context) => context.state.savedChart,
    );
    const exploreFromHereUrl = useMemo(() => {
        if (savedChart) {
            return getExplorerUrlFromCreateSavedChartVersion(
                savedChart.projectUuid,
                savedChart,
            );
        }
    }, [savedChart]);

    const { user } = useApp();
    const history = useHistory();
    const { mutateAsync: createShareUrl } = useCreateShareMutation();

    const handleCreateShareUrl = useCallback(async () => {
        if (!exploreFromHereUrl) return;

        const shareUrl = await createShareUrl({
            path: exploreFromHereUrl.pathname,
            params: `?` + exploreFromHereUrl.search,
        });

        history.push(`/share/${shareUrl.nanoid}`);
    }, [createShareUrl, exploreFromHereUrl, history]);

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
