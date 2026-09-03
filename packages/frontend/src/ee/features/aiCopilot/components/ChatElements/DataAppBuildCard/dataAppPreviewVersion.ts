import { type DataAppPreviewData } from '../../../store/aiArtifactSlice';

type EffectiveVersionArgs = {
    version: number | null;
    latestReadyVersionAtOpen: number | null;
    latestReadyVersion: number | null;
};

/** The version the preview shows: null means latest ready; an explicit one
 *  holds until a ready version newer than the one recorded at open lands. */
export const getEffectiveDataAppVersion = ({
    version,
    latestReadyVersionAtOpen,
    latestReadyVersion,
}: EffectiveVersionArgs): number | null => {
    if (version === null) return latestReadyVersion;
    const newerVersionLanded =
        latestReadyVersion !== null &&
        latestReadyVersionAtOpen !== null &&
        latestReadyVersion > latestReadyVersionAtOpen;
    return newerVersionLanded ? latestReadyVersion : version;
};

type CardActiveArgs = {
    preview: DataAppPreviewData | null;
    appUuid: string | null;
    version: number | null;
    latestReadyVersion: number | null;
};

/** A build card is active when its app and version are the ones on show. */
export const isDataAppCardActive = ({
    preview,
    appUuid,
    version,
    latestReadyVersion,
}: CardActiveArgs): boolean => {
    if (!preview || appUuid === null || version === null) return false;
    if (preview.appUuid !== appUuid) return false;
    return (
        version ===
        getEffectiveDataAppVersion({
            version: preview.version,
            latestReadyVersionAtOpen: preview.latestReadyVersionAtOpen,
            latestReadyVersion,
        })
    );
};
