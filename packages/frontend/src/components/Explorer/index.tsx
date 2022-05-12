import { FC } from 'react';
import { ExplorerWrapper } from './Explorer.styles';
import FiltersCard from './FiltersCard/FiltersCard';
import ResultsCard from './ResultsCard/ResultsCard';
import RunButtonsSection from './RunButtonsSection';
import SqlCard from './SqlCard/SqlCard';
import VisualizationCard from './VisualizationCard/VisualizationCard';

const Explorer: FC<{ isExplore?: boolean }> = ({ isExplore = false }) => {
    return (
        <ExplorerWrapper>
            {/* Remove conditional once the buttons are updated in the header*/}
            {isExplore && <RunButtonsSection />}
            <FiltersCard />
            <VisualizationCard />
            <ResultsCard />
            <SqlCard />
        </ExplorerWrapper>
    );
};

export default Explorer;
