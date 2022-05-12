import { FC } from 'react';
import { Divider } from './Explorer.styles';
import FiltersCard from './FiltersCard/FiltersCard';
import ResultsCard from './ResultsCard/ResultsCard';
import SqlCard from './SqlCard/SqlCard';
import VisualizationCard from './VisualizationCard/VisualizationCard';

const Explorer: FC = () => {
    return (
        <>
            {/* <ExplorerHeader /> */}
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
