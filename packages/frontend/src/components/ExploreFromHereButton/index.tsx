import { useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import { useExplorer } from '../../providers/ExplorerProvider';
import { ExploreFromHerePrimary } from './ExploreFromHere.styles';

const ExploreFromHereButton = () => {
    const history = useHistory();
    const {
        state: { savedChart },
    } = useExplorer();
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

    return (
        <ExploreFromHerePrimary
            intent="primary"
            icon="series-search"
            onClick={() =>
                exploreFromHereUrl ? history.push(exploreFromHereUrl) : null
            }
        >
            Explore from here
        </ExploreFromHerePrimary>
    );
};

export default ExploreFromHereButton;
