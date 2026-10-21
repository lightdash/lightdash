import {
    type ApiContentAsCodeUploadAdvisoryResponse,
    type ApiError,
} from '@lightdash/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useCallback, useRef, type FC } from 'react';
import { invalidateContent } from '../../../hooks/useContent';
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

    const close = () => {
        onClose();
        if (!attemptedUpload.current) return;
        // Refresh after closing so updating the current resource cannot interrupt the batch.
        void invalidateContent(queryClient, projectUuid);
        for (const key of [
            'saved_query',
            'saved_dashboard_query',
            'chart-as-code',
            'dashboard-as-code',
            'chart_history',
            'dashboard_history',
        ]) {
            void queryClient.invalidateQueries([key]);
        }
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
