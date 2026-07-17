import {
    parseGroupAsCode,
    type ApiGroupAsCodeListResponse,
    type ApiGroupAsCodeUpsertResponse,
    type GroupAsCode,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
    assertCodeResourceFilesValid,
    downloadCodeResource,
    readCodeResourceFiles,
    uploadCodeResource,
    type CodeFileFailure,
    type CodeResourceDefinition,
} from '../contentAsCode/resource';
import { lightdashApi } from '../dbt/apiClient';

export type GroupUploadFailure = CodeFileFailure;

export type GroupUploadSummary = {
    created: number;
    updated: number;
    unchanged: number;
    failed: number;
    dependencySkipped: number;
    failures: GroupUploadFailure[];
};

export const GROUP_CODE_RESOURCE: CodeResourceDefinition<GroupAsCode> = {
    kind: 'group',
    displayLabel: 'group',
    identityLabel: 'name',
    scope: 'organization',
    folderName: 'groups',
    acceptedExtensions: ['.yml'],
    fileName: {
        strategy: 'normalizedDisplayName',
        fallbackPrefix: 'group',
        extension: '.yml',
    },
    dependencies: ['custom_role', 'user'],
    identity: ({ name }) => name,
    displayName: ({ name }) => name,
    parse: parseGroupAsCode,
    sort: (left, right) => left.name.localeCompare(right.name),
};

export const getGroupsFolder = (organizationContentPath: string): string =>
    path.join(organizationContentPath, GROUP_CODE_RESOURCE.folderName);

export const formatGroupUploadSummary = (summary: GroupUploadSummary): string =>
    `${summary.created} created, ${summary.updated} updated, ${summary.unchanged} unchanged, ${summary.failed} failed, ${summary.dependencySkipped} dependency-skipped`;

export const readGroupFiles = async (
    organizationContentPath: string,
): Promise<unknown[]> => {
    const result = await readCodeResourceFiles({
        definition: GROUP_CODE_RESOURCE,
        basePath: organizationContentPath,
    });
    assertCodeResourceFilesValid(result);
    return result.files.map(({ document }) => document);
};

export const countDependencySkippedGroups = async (
    organizationContentPath: string,
): Promise<number> => {
    const folder = getGroupsFolder(organizationContentPath);
    try {
        const entries = await fs.readdir(folder, { withFileTypes: true });
        return entries.filter(
            (entry) =>
                entry.isFile() &&
                GROUP_CODE_RESOURCE.acceptedExtensions.some((extension) =>
                    entry.name.endsWith(extension),
                ),
        ).length;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
        throw error;
    }
};

export const uploadGroups = async (
    organizationUuid: string,
    organizationContentPath: string,
): Promise<GroupUploadSummary> => {
    const summary = await uploadCodeResource({
        definition: GROUP_CODE_RESOURCE,
        basePath: organizationContentPath,
        upsert: async (group) => {
            const result = await lightdashApi<
                ApiGroupAsCodeUpsertResponse['results']
            >({
                method: 'POST',
                url: `/api/v2/orgs/${organizationUuid}/code/groups`,
                body: JSON.stringify(group),
            });
            return result.action;
        },
    });
    return { ...summary, dependencySkipped: 0 };
};

export const downloadGroups = async (
    organizationUuid: string,
    organizationContentPath: string,
): Promise<number> =>
    downloadCodeResource({
        definition: GROUP_CODE_RESOURCE,
        basePath: organizationContentPath,
        list: async () => {
            const { groups } = await lightdashApi<
                ApiGroupAsCodeListResponse['results']
            >({
                method: 'GET',
                url: `/api/v2/orgs/${organizationUuid}/code/groups`,
                body: undefined,
            });
            return groups.map((group) => ({
                ...group,
                members: [...group.members].sort(),
            }));
        },
    });
