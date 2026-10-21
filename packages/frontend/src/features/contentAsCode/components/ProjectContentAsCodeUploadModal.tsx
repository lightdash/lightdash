import {
    assertUnreachable,
    getContentAsCodePathFromLtreePath,
    type ApiContentAsCodeUploadAdvisoryResponse,
    type ApiError,
} from '@lightdash/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useCallback, useRef, type FC } from 'react';
import { useContextSelector } from 'use-context-selector';
import { invalidateContent } from '../../../hooks/useContent';
import { useOptionalProjectRoute } from '../../../hooks/useProjectRoute';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import DashboardContext from '../../../providers/Dashboard/context';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import { type ImportDocument, type UploadContent } from '../importContent';
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
    const projectUrlIdentifier =
        useOptionalProjectRoute()?.projectUrlIdentifier ?? projectUuid;
    const { data: spaces } = useSpaceSummaries(projectUuid, true, {
        enabled: opened,
    });
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
        async (document) => {
            attemptedUpload.current = true;
            const result = await uploadContentAsCode(
                lightdashApi,
                projectUuid,
                document,
            );
            if (document.type === 'space') {
                void queryClient.invalidateQueries([
                    'projects',
                    projectUuid,
                    'spaces',
                ]);
            }
            return result;
        },
        [lightdashApi, projectUuid, queryClient],
    );

    const getContentUrl = (document: ImportDocument): string | null => {
        const projectPath = `/projects/${encodeURIComponent(projectUrlIdentifier)}`;
        switch (document.type) {
            case 'chart':
                return `${projectPath}/saved/${encodeURIComponent(document.content.slug)}`;
            case 'dashboard':
                return `${projectPath}/dashboards/${encodeURIComponent(document.content.slug)}/view`;
            case 'space': {
                const space = spaces?.find(
                    (item) =>
                        (item.path
                            ? getContentAsCodePathFromLtreePath(item.path)
                            : item.slug) === document.content.slug,
                );
                return space ? `${projectPath}/spaces/${space.uuid}` : null;
            }
            default:
                return assertUnreachable(document, 'Unsupported content type');
        }
    };

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
                getContentUrl={getContentUrl}
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
