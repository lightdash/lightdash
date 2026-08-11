/* eslint-disable no-await-in-loop */
import {
    assertUnreachable,
    getErrorMessage,
    ORGANIZATION_DESIGN_PACKAGE_CONTENT_TYPE,
    ParameterError,
    PromotionAction,
    type ApiOrganizationDesign,
    type ApiOrganizationDesignPackageImportResponse,
    type ApiOrganizationDesignResponse,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import { lightdashApi, lightdashRawApi } from '../dbt/apiClient';
import {
    getThemesFolder,
    parseThemeArchive,
    writeThemePackage,
    type PreparedThemeUpload,
} from './themePackage';

export { prepareThemeUploads } from './themePackage';

export type ThemeUploadSummary = {
    created: number;
    updated: number;
    unchanged: number;
    failed: number;
    completedSlugs: string[];
    failures: Array<{ message: string }>;
};

export const downloadThemes = async (
    organizationContentPath: string,
): Promise<number> => {
    const themes = await lightdashApi<ApiOrganizationDesign[]>({
        method: 'GET',
        url: '/api/v1/org/designs/',
        body: undefined,
    });
    await fs.mkdir(getThemesFolder(organizationContentPath), {
        recursive: true,
    });

    for (const theme of [...themes].sort((left, right) =>
        left.slug.localeCompare(right.slug),
    )) {
        const response = await lightdashRawApi({
            method: 'GET',
            url: `/api/v1/org/designs/${encodeURIComponent(theme.slug)}/package`,
            body: undefined,
        });
        const parsed = await parseThemeArchive(
            Buffer.from(await response.arrayBuffer()),
        );
        if (parsed.manifest.slug !== theme.slug) {
            throw new ParameterError(
                `Downloaded theme slug "${parsed.manifest.slug}" does not match requested slug "${theme.slug}"`,
            );
        }
        await writeThemePackage(organizationContentPath, parsed);
    }
    return themes.length;
};

export const uploadThemes = async (
    prepared: PreparedThemeUpload[],
): Promise<ThemeUploadSummary> => {
    const summary: ThemeUploadSummary = {
        created: 0,
        updated: 0,
        unchanged: 0,
        failed: 0,
        completedSlugs: [],
        failures: [],
    };
    if (prepared.length === 0) return summary;

    const existingThemes = await lightdashApi<ApiOrganizationDesign[]>({
        method: 'GET',
        url: '/api/v1/org/designs/',
        body: undefined,
    });
    const existingSlugs = new Set(existingThemes.map(({ slug }) => slug));
    for (const theme of prepared) {
        try {
            const response = await lightdashRawApi({
                method: 'PUT',
                url: '/api/v1/org/designs/package',
                body: theme.archive,
                headers: {
                    'Content-Type': ORGANIZATION_DESIGN_PACKAGE_CONTENT_TYPE,
                    'Content-Length': String(theme.archive.length),
                },
            });
            const result = (await response.json()) as
                | ApiOrganizationDesignPackageImportResponse
                | ApiOrganizationDesignResponse;
            if (result.status !== 'ok') {
                throw new Error('Theme import returned an invalid response');
            }
            if (result.results.slug !== theme.manifest.slug) {
                throw new Error(
                    `Theme import returned slug "${result.results.slug}" instead of "${theme.manifest.slug}"`,
                );
            }
            let action: PromotionAction;
            if ('action' in result.results) {
                action = result.results.action;
            } else if (existingSlugs.has(result.results.slug)) {
                action = PromotionAction.UPDATE;
            } else {
                action = PromotionAction.CREATE;
            }
            switch (action) {
                case PromotionAction.CREATE:
                    summary.created += 1;
                    break;
                case PromotionAction.UPDATE:
                    summary.updated += 1;
                    break;
                case PromotionAction.NO_CHANGES:
                    summary.unchanged += 1;
                    break;
                default:
                    assertUnreachable(
                        action,
                        'Unsupported theme import action',
                    );
            }
            summary.completedSlugs.push(result.results.slug);
        } catch (error) {
            summary.failures.push({
                message: `Failed to upload theme "${theme.manifest.slug}": ${getErrorMessage(error)}`,
            });
        }
    }
    summary.failed = summary.failures.length;
    return summary;
};

export const formatThemeUploadSummary = (summary: ThemeUploadSummary): string =>
    [
        `${summary.created} created`,
        `${summary.updated} updated`,
        `${summary.unchanged} unchanged`,
        ...(summary.failed > 0 ? [`${summary.failed} failed`] : []),
    ].join(', ');
