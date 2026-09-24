import { type ApiError, type DataAppViz } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useEmbed from '../../../ee/providers/Embed/useEmbed';

export const getDataAppVisualization = async (
    projectUuid: string,
    dataAppVizUuid: string,
    version: number | null,
    isEmbedded: boolean = false,
): Promise<DataAppViz> => {
    const baseUrl = isEmbedded
        ? `/embed/${projectUuid}/visualizations`
        : `/ee/projects/${projectUuid}/apps/visualizations`;
    return lightdashApi<DataAppViz>({
        method: 'GET',
        url: `${baseUrl}/${dataAppVizUuid}${
            version === null ? '' : `?version=${version}`
        }`,
        body: undefined,
    });
};

// Fetches a single saved data app viz by id, at one version. A schema belongs to
// the version that generated it, so a caller showing a particular version names
// it and gets that version's fields and options. `null` asks for the latest
// ready version — the one charts render, and the one the builder shows until it
// is pinned to an older one.
export const useDataAppVisualization = (
    projectUuid: string | undefined,
    dataAppVizUuid: string | null,
    version: number | null,
) => {
    const { embedToken } = useEmbed();
    const isEmbedded = !!embedToken;
    return useQuery<DataAppViz, ApiError>({
        queryKey: [
            'data-app-viz',
            projectUuid,
            dataAppVizUuid,
            version,
            isEmbedded ? 'embed' : 'registered',
        ],
        queryFn: () =>
            getDataAppVisualization(
                projectUuid!,
                dataAppVizUuid!,
                version,
                isEmbedded,
            ),
        enabled: !!projectUuid && dataAppVizUuid !== null,
        // A version switch keeps the previous schema so the panel doesn't
        // collapse; deselecting must not, or callers would name a stale type.
        keepPreviousData: dataAppVizUuid !== null,
    });
};
