import { type SavedChart } from '@lightdash/common';
import { useEffect, useState, type FC } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router';
import EmbedProvider from '../../providers/Embed/EmbedProvider';
import useEmbed from '../../providers/Embed/useEmbed';

/**
 * Applies the embed's custom background color if provided.
 *
 * The color scheme itself is forced at the app root (see App.tsx) from the
 * ?theme= URL param, so the embed never writes to the viewer's shared
 * (cross-tab) theme preference.
 */
const EmbedBackgroundColorSync: FC<React.PropsWithChildren> = ({
    children,
}) => {
    const { backgroundColor } = useEmbed();

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
    const [exploreReturnUrl, setExploreReturnUrl] = useState<string>();
    const navigate = useNavigate();

    const handleExplore = (options: {
        chart: SavedChart;
        returnUrl?: string;
    }) => {
        setSavedChart(options.chart);
        setExploreReturnUrl(options.returnUrl);
        void navigate(
            `/embed/${projectUuid}/explore/${options.chart.tableName}`,
        );
    };

    const handleBackToDashboard = async () => {
        await navigate(exploreReturnUrl ?? `/embed/${projectUuid}`);
    };

    return (
        <EmbedProvider
            savedChart={savedChart}
            projectUuid={projectUuid}
            onExplore={handleExplore}
            onBackToDashboard={handleBackToDashboard}
            exploreBackLabel={
                exploreReturnUrl ? 'Back to agent' : 'Back to Dashboard'
            }
        >
            <EmbedBackgroundColorSync>
                <Outlet />
            </EmbedBackgroundColorSync>
        </EmbedProvider>
    );
};

export default EmbeddedApp;
