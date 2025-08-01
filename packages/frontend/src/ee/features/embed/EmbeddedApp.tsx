import { type SavedChart } from '@lightdash/common';
import { type FC, useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router';
import EmbedProvider from '../../providers/Embed/EmbedProvider';

/**
 * A wrapping app around the Embed Context Provider. This allows better management of
 * the embedded iframe experience.
 */
const EmbeddedApp: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [savedChart, setSavedChart] = useState<SavedChart>();
    const navigate = useNavigate();

    const handleExplore = (options: { chart: SavedChart }) => {
        setSavedChart(options.chart);
        void navigate(
            `/embed/${projectUuid}/explore/${options.chart.tableName}`,
        );
    };

    const handleBackToDashboard = async () => {
        await navigate(`/embed/${projectUuid}`);
    };

    return (
        <EmbedProvider
            savedChart={savedChart}
            projectUuid={projectUuid}
            onExplore={handleExplore}
            onBackToDashboard={handleBackToDashboard}
        >
            <Outlet />
        </EmbedProvider>
    );
};

export default EmbeddedApp;
