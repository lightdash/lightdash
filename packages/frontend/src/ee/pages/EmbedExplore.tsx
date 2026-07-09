import {
    isChartContent,
    type CreateSavedChartVersion,
    type SavedChart,
} from '@lightdash/common';
import { IconUnlink } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import { parseChartFromExplorerSearchParams } from '../../hooks/useExplorerRoute';
import { useSavedQuery } from '../../hooks/useSavedQuery';
import EmbedExplore from '../features/embed/EmbedExplore/components/EmbedExplore';
import useEmbed from '../providers/Embed/useEmbed';

type EmbedExploreChart = SavedChart | CreateSavedChartVersion;

const EmbedExplorePage: FC<{
    containerStyles?: React.CSSProperties;
    exploreId?: string;
    savedChart?: EmbedExploreChart;
}> = ({
    containerStyles,
    exploreId: exploreIdProps,
    savedChart: savedChartProps,
}) => {
    const {
        content,
        embedToken,
        projectUuid: embedProjectUuid,
        savedChart: savedChartEmbed,
    } = useEmbed();
    const { projectUuid: paramsProjectUuid } = useParams<{
        projectUuid: string;
    }>();
    const { search } = useLocation();
    const [searchParams] = useSearchParams();
    const projectUuid = embedProjectUuid ?? paramsProjectUuid;
    const chartUuidFromJwt =
        content && isChartContent(content) ? content.contentId : undefined;
    const chartUuid = searchParams.get('chartUuid') ?? chartUuidFromJwt;
    const chartFromUrl = useMemo(() => {
        try {
            return parseChartFromExplorerSearchParams(search);
        } catch {
            return undefined;
        }
    }, [search]);
    const chartQuery = useSavedQuery({
        uuidOrSlug: chartUuid,
        projectUuid,
        useQueryOptions: {
            enabled:
                !!embedToken &&
                chartFromUrl === undefined &&
                savedChartEmbed === undefined &&
                savedChartProps === undefined &&
                chartUuid !== undefined,
        },
    });
    const savedChart =
        savedChartEmbed || savedChartProps || chartFromUrl || chartQuery.data;

    if (!embedToken) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    icon={IconUnlink}
                    title="This embed link is not valid"
                />
            </div>
        );
    }

    if (!savedChart && chartQuery.isInitialLoading) {
        return null;
    }

    if (!savedChart) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title="Missing saved chart to explore"
                    icon={IconUnlink}
                />
            </div>
        );
    }

    const exploreId = exploreIdProps || savedChart?.tableName;

    return (
        <EmbedExplore
            containerStyles={containerStyles}
            exploreId={exploreId}
            savedChart={savedChart}
        />
    );
};

export default EmbedExplorePage;
