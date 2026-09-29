import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';

type ArtifactRef = { artifactUuid: string; versionUuid: string };

export const useAiChartDownloadDeepLink = ({
    allowDownloadDeepLink,
    canDownloadResults,
    isDisabled,
    artifact,
    openDownloadModal,
}: {
    allowDownloadDeepLink: boolean;
    canDownloadResults: boolean;
    isDisabled: boolean;
    artifact: ArtifactRef | undefined;
    openDownloadModal: () => void;
}) => {
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        if (
            !allowDownloadDeepLink ||
            !canDownloadResults ||
            isDisabled ||
            !artifact
        )
            return;
        const params = new URLSearchParams(location.search);
        if (
            params.get('downloadArtifactUuid') !== artifact.artifactUuid ||
            params.get('downloadVersionUuid') !== artifact.versionUuid
        )
            return;

        openDownloadModal();
        params.delete('downloadArtifactUuid');
        params.delete('downloadVersionUuid');
        void navigate(
            { pathname: location.pathname, search: params.toString() },
            { replace: true },
        );
    }, [
        allowDownloadDeepLink,
        canDownloadResults,
        isDisabled,
        artifact,
        location.pathname,
        location.search,
        navigate,
        openDownloadModal,
    ]);
};
