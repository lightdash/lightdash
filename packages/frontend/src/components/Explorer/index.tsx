import { FC } from 'react';
import { ExplorerWrapper } from './Explorer.styles';
import FiltersCard from './FiltersCard/FiltersCard';
import ResultsCard from './ResultsCard/ResultsCard';
import SqlCard from './SqlCard/SqlCard';
import VisualizationCard from './VisualizationCard/VisualizationCard';

const Explorer: FC = () => {
    return (
        <ExplorerWrapper>
            {/* Commented until header buttons are updated with the new ones */}
            {/* <RunButtonsSection /> */}
            <FiltersCard />
            <VisualizationCard />
            <ResultsCard />
            <SqlCard />
        </ExplorerWrapper>
    );
};

export default Explorer;
