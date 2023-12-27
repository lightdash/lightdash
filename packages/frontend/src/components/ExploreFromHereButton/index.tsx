import { subject } from '@casl/ability';
import { Button } from '@mantine/core';
import { IconTelescope } from '@tabler/icons-react';
import { useMemo } from 'react';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import { useApp } from '../../providers/AppProvider/useApp';
import { useExplorerContext } from '../../providers/ExplorerProvider/useExplorerContext';
import MantineIcon from '../common/MantineIcon';

const ExploreFromHereButton = () => {
    const savedChart = useExplorerContext(
        (context) => context.state.savedChart,
    );
    const exploreFromHereUrl = useMemo(() => {
        if (savedChart) {
            const { pathname, search } =
                getExplorerUrlFromCreateSavedChartVersion(
                    savedChart.projectUuid,
                    savedChart,
                );
            return `${pathname}?${search}`;
        }
    }, [savedChart]);

    const { user } = useApp();
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
            component="a"
            size="xs"
            leftIcon={<MantineIcon icon={IconTelescope} />}
            href={exploreFromHereUrl}
        >
            Explore from here
        </Button>
    );
};

export default ExploreFromHereButton;
