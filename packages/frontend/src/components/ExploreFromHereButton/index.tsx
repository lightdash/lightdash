import { useMemo } from 'react';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
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

    if (!exploreFromHereUrl) return null;

    return (
        <StyledLinkButton
            intent="primary"
            large
            icon="series-search"
            href={exploreFromHereUrl}
        >
            Explore from here
        </StyledLinkButton>
    );
};

export default ExploreFromHereButton;
