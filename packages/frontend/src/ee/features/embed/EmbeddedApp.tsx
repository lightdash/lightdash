import { type SavedChart } from '@lightdash/common';
import { useMantineColorScheme } from '@mantine/core';
import { useEffect, useState, type FC } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router';
import EmbedProvider from '../../providers/Embed/EmbedProvider';
import useEmbed from '../../providers/Embed/useEmbed';

/**
 * Syncs the embed theme URL params with the Mantine color scheme
 * and applies a custom background color if provided.
 */
const EmbedThemeSync: FC<React.PropsWithChildren> = ({ children }) => {
    const { theme, backgroundColor } = useEmbed();
    const { toggleColorScheme } = useMantineColorScheme();

    useEffect(() => {
        toggleColorScheme(theme);
    }, [theme, toggleColorScheme]);

    useEffect(() => {
        if (backgroundColor) {
            document.documentElement.style.backgroundColor = backgroundColor;
            document.body.style.backgroundColor = backgroundColor;
        }
        return () => {
            document.documentElement.style.backgroundColor = '';
            document.body.style.backgroundColor = '';
        };
    }, [backgroundColor]);

    return <>{children}</>;
};

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
            <EmbedThemeSync>
                <Outlet />
            </EmbedThemeSync>
        </EmbedProvider>
    );
};

export default EmbeddedApp;
