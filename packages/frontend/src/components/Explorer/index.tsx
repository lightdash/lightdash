import { FC } from 'react';
import ExploreHeader from './ExploreHeader/ExploreHeader';
import { Divider } from './Explorer.styles';
import FiltersCard from './FiltersCard/FiltersCard';
import ResultsCard from './ResultsCard/ResultsCard';
import SqlCard from './SqlCard/SqlCard';
import VisualizationCard from './VisualizationCard/VisualizationCard';

const Explorer: FC = () => {
    return (
        <>
            <ExploreHeader />
            <Divider />
            <FiltersCard />
            <Divider />
            <VisualizationCard />
            <Divider />
            <ResultsCard />
            <Divider />
            <SqlCard />
        </>
    );
};

export default Explorer;
