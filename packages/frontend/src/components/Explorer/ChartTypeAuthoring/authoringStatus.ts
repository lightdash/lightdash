import { assertUnreachable } from '@lightdash/common';
import { type ChartTypeBuilderWorkspaceState } from '../../../features/chartTypes/builder/useChartTypeBuilderWorkspace';
import i18n from '../../../i18n/i18n';

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
            return status.elapsed
                ? i18n.t('chartStudio.status.buildingElapsed', {
                      ns: 'explorer',
                      elapsed: status.elapsed,
                  })
                : i18n.t('chartStudio.status.building', { ns: 'explorer' });
        case 'ready':
            return i18n.t('chartStudio.status.ready', {
                ns: 'explorer',
                version: status.version,
            });
        default:
            return assertUnreachable(status, 'Unknown authoring status');
    }
};
