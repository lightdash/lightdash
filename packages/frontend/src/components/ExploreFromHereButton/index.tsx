import { subject } from '@casl/ability';
import { IconTelescope } from '@tabler/icons-react';
import { useMemo } from 'react';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import { useApp } from '../../providers/AppProvider';
import { useExplorerContext } from '../../providers/ExplorerProvider';
import LinkButton from '../common/LinkButton';
import { StyledLinkButton } from '../Home/LandingPanel/LandingPanel.styles';

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
        <StyledLinkButton
            intent="primary"
            large
            icon={<IconTelescope size={16} />}
            href={exploreFromHereUrl}
        >
            Explore from here
        </StyledLinkButton>
    );
};

export default ExploreFromHereButton;
