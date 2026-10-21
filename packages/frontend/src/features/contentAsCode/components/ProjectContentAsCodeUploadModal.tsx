import {
    type ApiContentAsCodeUploadAdvisoryResponse,
    type ApiError,
} from '@lightdash/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useCallback, useRef, type FC } from 'react';
import { useContextSelector } from 'use-context-selector';
import { invalidateContent } from '../../../hooks/useContent';
import DashboardContext from '../../../providers/Dashboard/context';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import { type UploadContent } from '../importContent';
import { uploadContentAsCode } from '../uploadContent';

const ContentAsCodeUploadModal = lazy(
    () => import('./ContentAsCodeUploadModal'),
);

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    projectName: string;
};

const ProjectContentAsCodeUploadModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    projectName,
}) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const refreshDashboardVersion = useContextSelector(
        DashboardContext,
        (context) => context?.refreshDashboardVersion,
    );
    const attemptedUpload = useRef(false);
    const advisory = useQuery<
        ApiContentAsCodeUploadAdvisoryResponse['results'],
        ApiError
    >({
        queryKey: ['content-as-code-upload-advisory', projectUuid],
        queryFn: () =>
            lightdashApi<ApiContentAsCodeUploadAdvisoryResponse['results']>({
                method: 'GET',
                url: `/projects/${projectUuid}/code/upload-advisory`,
                body: undefined,
            }),
        enabled: opened,
        retry: false,
    });

    const upload = useCallback<UploadContent>(
        (document) => {
            attemptedUpload.current = true;
            return uploadContentAsCode(lightdashApi, projectUuid, document);
        },
        [lightdashApi, projectUuid],
    );

    const refreshQueries = () => {
        void invalidateContent(queryClient, projectUuid);
        for (const key of [
            'saved_query',
            'saved_dashboard_query',
            'chart-as-code',
            'dashboard-as-code',
            'chart_history',
            'dashboard_history',
            'dashboard_chart_ready_query',
            'savedSqlChartResults',
        ]) {
            void queryClient.invalidateQueries([key]);
        }
    };

    const close = () => {
        onClose();
        if (!attemptedUpload.current) return;
        // Refresh local dashboard tiles/tabs before invalidating the saved version.
        // Do this after the batch so a current-resource update cannot interrupt uploads.
        void (refreshDashboardVersion?.() ?? Promise.resolve()).then(
            refreshQueries,
            refreshQueries,
        );
    };

    return (
        <Suspense fallback={null}>
            <ContentAsCodeUploadModal
                opened={opened}
                onClose={close}
                projectName={projectName}
                onUpload={upload}
                warning={
                    advisory.isError
                        ? 'Could not check for open content drafts. Uploads may overwrite changes that have not been written back to your repository.'
                        : advisory.data && advisory.data.openDraftCount > 0
                          ? `This project has ${advisory.data.openDraftCount} open content draft${advisory.data.openDraftCount === 1 ? '' : 's'}. Uploads may overwrite changes that have not been written back to your repository.`
                          : null
                }
            />
        </Suspense>
    );
};

export default ProjectContentAsCodeUploadModal;
