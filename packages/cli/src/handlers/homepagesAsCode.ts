/* eslint-disable no-await-in-loop */
import {
    getErrorMessage,
    LightdashError,
    ParameterError,
    PromotionAction,
    type ApiHomepageAsCodeListResponse,
    type ApiHomepageAsCodeUpsertResponse,
} from '@lightdash/common';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { HOMEPAGE_CODE_RESOURCE } from './contentAsCode/projectResources';
import {
    assertCodeResourceFilesValid,
    readCodeResourceFiles,
    writeCodeResourceDocuments,
} from './contentAsCode/resource';
import { getDownloadFolder } from './contentAsCodePaths';
import { lightdashApi } from './dbt/apiClient';

export const downloadHomepages = async (
    projectUuid: string,
    names: string[],
    customPath?: string,
    implicit: boolean = false,
): Promise<number> => {
    const query = new URLSearchParams(
        names.map((name): [string, string] => ['names', name]),
    );
    let result: ApiHomepageAsCodeListResponse['results'];
    try {
        result = await lightdashApi<ApiHomepageAsCodeListResponse['results']>({
            method: 'GET',
            url: `/api/v1/projects/${projectUuid}/code/homepages?${query}`,
            body: undefined,
        });
    } catch (error) {
        if (
            implicit &&
            error instanceof LightdashError &&
            [403, 404, 422].includes(error.statusCode)
        ) {
            GlobalState.log(
                styles.warning(
                    'Skipping homepages: the homepage builder and homepage management permission are required.',
                ),
            );
            return 0;
        }
        throw error;
    }
    if (result.missingNames.length)
        throw new ParameterError(
            `Homepages not found or unpublished: ${result.missingNames.join(', ')}`,
        );
    await writeCodeResourceDocuments({
        definition: HOMEPAGE_CODE_RESOURCE,
        basePath: getDownloadFolder(customPath),
        documents: result.homepages,
        pruneOtherDocuments: names.length === 0,
    });
    return result.homepages.length;
};

export const uploadHomepages = async (
    projectUuid: string,
    names: string[],
    changes: Record<string, number>,
    publish: boolean,
    customPath?: string,
): Promise<Record<string, number>> => {
    const uploadChanges = { ...changes };
    const files = await readCodeResourceFiles({
        definition: HOMEPAGE_CODE_RESOURCE,
        basePath: getDownloadFolder(customPath),
    });
    assertCodeResourceFilesValid(files);
    const documents = files.files
        .map((file) => file.document)
        .filter(
            (document) => names.length === 0 || names.includes(document.name),
        );
    const missing = names.filter(
        (name) => !documents.some((document) => document.name === name),
    );
    if (missing.length)
        throw new ParameterError(
            `Homepages not found locally: ${missing.join(', ')}`,
        );
    for (const document of documents) {
        try {
            const result = await lightdashApi<
                ApiHomepageAsCodeUpsertResponse['results']
            >({
                method: 'POST',
                url: `/api/v1/projects/${projectUuid}/code/homepages/${encodeURIComponent(document.name)}?publish=${publish}`,
                body: JSON.stringify(document),
            });
            const actionLabels = {
                [PromotionAction.CREATE]: 'created',
                [PromotionAction.UPDATE]: 'updated',
                [PromotionAction.NO_CHANGES]: 'unchanged',
            };
            const key = `homepages ${actionLabels[result.action]}`;
            uploadChanges[key] = (uploadChanges[key] ?? 0) + 1;
        } catch (error) {
            uploadChanges['homepages with errors'] =
                (uploadChanges['homepages with errors'] ?? 0) + 1;
            GlobalState.log(
                styles.error(
                    `Error uploading homepage "${document.name}": ${getErrorMessage(error)}`,
                ),
            );
        }
    }
    return uploadChanges;
};
