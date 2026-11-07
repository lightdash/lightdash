import { type ApiInstallStarterChartTypesResponse } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import { useChartTypesEnabled } from './useChartTypesEnabled';

/** Installs the starter chart types once per mount; quiet, since nothing waits on it */
export const useInstallStarterChartTypes = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { enabled } = useChartTypesEnabled();
    const { mutate } = useMutation({
        mutationFn: () =>
            lightdashApi<ApiInstallStarterChartTypesResponse['results']>({
                method: 'POST',
                url: `/ee/projects/${projectUuid}/apps/registry/starter-charts/install`,
                body: undefined,
            }),
        onSuccess: ({ installedSlugs }) => {
            if (installedSlugs.length === 0) return;
            void queryClient.invalidateQueries({
                queryKey: ['registry-chart-types', projectUuid],
            });
            void queryClient.invalidateQueries({ queryKey: ['data-app-vizs'] });
        },
    });
    useEffect(() => {
        if (enabled) mutate();
    }, [enabled, mutate, projectUuid]);
};
