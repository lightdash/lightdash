import React, { useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import { useContextSelector } from 'use-context-selector';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import { Context } from '../../providers/ExplorerProvider';
import { ExploreFromHerePrimary } from './ExploreFromHere.styles';

const ExploreFromHereButton = () => {
    const history = useHistory();
    const savedChart = useContextSelector(
        Context,
        (context) => context!.state.savedChart,
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
