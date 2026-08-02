import { useEffect, useState, type FC } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router';
import EmbedProvider from '../../providers/Embed/EmbedProvider';
import { type EmbedExploreChart } from '../../providers/Embed/types';
import useEmbed from '../../providers/Embed/useEmbed';

type EmbedExploreLocationState = {
    embedBackUrl?: string;
};

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
    const [savedChart, setSavedChart] = useState<EmbedExploreChart>();
    const navigate = useNavigate();
    const location = useLocation();

    const handleExplore = (options: { chart: EmbedExploreChart }) => {
        setSavedChart(options.chart);
        void navigate(
            `/embed/${projectUuid}/explore/${options.chart.tableName}`,
            {
                state: {
                    embedBackUrl: `${location.pathname}${location.search}`,
                } satisfies EmbedExploreLocationState,
            },
        );
    };

    const handleBackToDashboard = async () => {
        const state = location.state as EmbedExploreLocationState | null;
        if (state?.embedBackUrl) {
            await navigate(state.embedBackUrl);
            return;
        }

        await navigate(`/embed/${projectUuid}`);
    };

    return (
        <EmbedProvider
            savedChart={savedChart}
            projectUuid={projectUuid}
            onExplore={handleExplore}
            onBackToDashboard={handleBackToDashboard}
        >
            <EmbedBackgroundColorSync>
                <Outlet />
            </EmbedBackgroundColorSync>
        </EmbedProvider>
    );
};

export default EmbeddedApp;
