import {
    assertUnreachable,
    PromotionAction,
    SpaceAsCodeAction,
    type ApiChartAsCodeUpsertResponse,
    type ApiDashboardAsCodeUpsertResponse,
    type ApiSpaceAsCodeUpsertResponse,
} from '@lightdash/common';
import { type LightdashApi } from '../../api';
import { type ImportDocument, type ImportResult } from './importContent';

const actionLabels: Record<PromotionAction, string> = {
    [PromotionAction.CREATE]: 'Created',
    [PromotionAction.UPDATE]: 'Updated',
    [PromotionAction.NO_CHANGES]: 'No changes',
    [PromotionAction.DELETE]: 'Deleted',
};

export const uploadContentAsCode = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    document: ImportDocument,
): Promise<ImportResult> => {
    const url = `/projects/${projectUuid}/code`;
    switch (document.type) {
        case 'space': {
            const result = await lightdashApi<
                ApiSpaceAsCodeUpsertResponse['results']
            >({
                method: 'POST',
                url: `${url}/spaces`,
                body: JSON.stringify(document.content),
            });
            const labels: Record<SpaceAsCodeAction, string> = {
                [SpaceAsCodeAction.CREATE]: 'Created',
                [SpaceAsCodeAction.UPDATE]: 'Updated',
                [SpaceAsCodeAction.NO_CHANGES]: 'No changes',
            };
            return {
                message: labels[result.action],
                warnings: result.warnings ?? [],
            };
        }
        case 'chart': {
            const result = await lightdashApi<
                ApiChartAsCodeUpsertResponse['results']
            >({
                method: 'POST',
                url: `${url}/charts/${encodeURIComponent(document.content.slug)}`,
                // Edited exports retain their timestamps; force applies query/config changes too.
                body: JSON.stringify({ ...document.content, force: true }),
            });
            const change = result.charts.find(
                ({ data }) => data.slug === document.content.slug,
            );
            return {
                message: change ? actionLabels[change.action] : 'Uploaded',
                warnings: [],
            };
        }
        case 'dashboard': {
            const result = await lightdashApi<
                ApiDashboardAsCodeUpsertResponse['results']
            >({
                method: 'POST',
                url: `${url}/dashboards/${encodeURIComponent(document.content.slug)}`,
                body: JSON.stringify(document.content),
            });
            const change = result.dashboards.find(
                ({ data }) => data.slug === document.content.slug,
            );
            return {
                message: change ? actionLabels[change.action] : 'Uploaded',
                warnings: result.warnings ?? [],
            };
        }
        default:
            return assertUnreachable(document, 'Unsupported content type');
    }
};
