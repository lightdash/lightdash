import { type ApiError, type DataAppViz } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getDataAppVisualization = async (
    projectUuid: string,
    dataAppVizUuid: string,
    version: number | null,
): Promise<DataAppViz> =>
    lightdashApi<DataAppViz>({
        method: 'GET',
        url: `/ee/projects/${projectUuid}/apps/visualizations/${dataAppVizUuid}${
            version === null ? '' : `?version=${version}`
        }`,
        body: undefined,
    });

// Fetches a single saved data app viz by id, at one version. A schema belongs to
// the version that generated it, so a caller showing a particular version names
// it and gets that version's fields and options. `null` asks for the latest
// ready version — the one charts render, and the one the builder shows until it
// is pinned to an older one.
export const useDataAppVisualization = (
    projectUuid: string | undefined,
    dataAppVizUuid: string | undefined,
    version: number | null,
) =>
    useQuery<DataAppViz, ApiError>({
        queryKey: ['data-app-viz', projectUuid, dataAppVizUuid, version],
        queryFn: () =>
            getDataAppVisualization(projectUuid!, dataAppVizUuid!, version),
        enabled: !!projectUuid && !!dataAppVizUuid,
        // Switching version keeps the panel on the previous schema until the new
        // one lands, so the configuration column doesn't collapse mid-swap.
        keepPreviousData: true,
    });
