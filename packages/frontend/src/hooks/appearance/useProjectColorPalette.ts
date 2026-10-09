import {
    type ApiError,
    type ApiProjectColorPaletteResponse,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';

type ResolvedPalette = ApiProjectColorPaletteResponse['results'];

export type ProjectColorPaletteContext = {
    spaceUuid?: string;
    dashboardUuid?: string;
    chartUuid?: string;
};

const getProjectColorPalette = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    context: ProjectColorPaletteContext,
) => {
    const params = new URLSearchParams();
    if (context.spaceUuid) params.set('spaceUuid', context.spaceUuid);
    if (context.dashboardUuid)
        params.set('dashboardUuid', context.dashboardUuid);
    if (context.chartUuid) params.set('chartUuid', context.chartUuid);
    const qs = params.toString();
    return lightdashApi<ResolvedPalette>({
        url: `/projects/${projectUuid}/colorPalette${qs ? `?${qs}` : ''}`,
        method: 'GET',
        body: undefined,
    });
};

export const useProjectColorPalette = (
    projectUuid: string | undefined,
    context: ProjectColorPaletteContext = {},
    options: { enabled?: boolean } = {},
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ResolvedPalette, ApiError>({
        queryKey: [
            'project',
            projectUuid,
            'color-palette',
            context.spaceUuid ?? null,
            context.dashboardUuid ?? null,
            context.chartUuid ?? null,
        ],
        queryFn: () =>
            getProjectColorPalette(lightdashApi, projectUuid!, context),
        enabled: Boolean(projectUuid) && options.enabled !== false,
    });
};
