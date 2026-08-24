import { type ChartTypeBuilderWorkspaceState } from '../../../features/chartTypes/builder/useChartTypeBuilderWorkspace';

/** What the header says beside the title; null while nothing is happening. */
export type AuthoringStatus =
    | { kind: 'building'; elapsed: string | null }
    | { kind: 'ready'; version: number };

export const deriveAuthoringStatus = ({
    isBuilding,
    elapsed,
    previewVersion,
    history,
}: Pick<
    ChartTypeBuilderWorkspaceState,
    'isBuilding' | 'elapsed' | 'previewVersion' | 'history'
>): AuthoringStatus | null => {
    if (isBuilding) return { kind: 'building', elapsed };
    if (
        previewVersion !== null &&
        previewVersion === history.latestReadyVersion
    )
        return { kind: 'ready', version: previewVersion };
    return null;
};

export const authoringStatusLabel = (status: AuthoringStatus): string => {
    switch (status.kind) {
        case 'building':
            return status.elapsed ? `Building ${status.elapsed}` : 'Building';
        case 'ready':
            return `v${status.version} ready`;
    }
};
