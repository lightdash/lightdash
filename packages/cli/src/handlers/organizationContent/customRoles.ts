import {
    parseCustomRoleAsCode,
    type ApiCustomRoleAsCodeListResponse,
    type ApiCustomRoleAsCodeUpsertResponse,
    type CustomRoleAsCode,
} from '@lightdash/common';
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

export type CustomRoleUploadFailure = CodeFileFailure;

export type CustomRoleUploadSummary = {
    created: number;
    updated: number;
    unchanged: number;
    failed: number;
    failures: CustomRoleUploadFailure[];
};

export const CUSTOM_ROLE_CODE_RESOURCE: CodeResourceDefinition<CustomRoleAsCode> =
    {
        kind: 'custom_role',
        displayLabel: 'custom role',
        identityLabel: 'name',
        scope: 'organization',
        folderName: 'custom-roles',
        acceptedExtensions: ['.yml'],
        fileName: {
            strategy: 'normalizedDisplayName',
            fallbackPrefix: 'role',
            extension: '.yml',
        },
        dependencies: [],
        identity: ({ name }) => name,
        displayName: ({ name }) => name,
        parse: parseCustomRoleAsCode,
        sort: (left, right) => left.name.localeCompare(right.name),
    };

export const getCustomRolesFolder = (organizationContentPath: string): string =>
    path.join(organizationContentPath, CUSTOM_ROLE_CODE_RESOURCE.folderName);

export const formatCustomRoleUploadSummary = (
    summary: CustomRoleUploadSummary,
): string =>
    `${summary.created} created, ${summary.updated} updated, ${summary.unchanged} unchanged, ${summary.failed} failed`;

export const readCustomRoleFiles = async (
    organizationContentPath: string,
): Promise<unknown[]> => {
    const result = await readCodeResourceFiles({
        definition: CUSTOM_ROLE_CODE_RESOURCE,
        basePath: organizationContentPath,
    });
    assertCodeResourceFilesValid(result);
    return result.files.map(({ document }) => document);
};

export const uploadCustomRoles = async (
    organizationUuid: string,
    organizationContentPath: string,
): Promise<CustomRoleUploadSummary> =>
    uploadCodeResource({
        definition: CUSTOM_ROLE_CODE_RESOURCE,
        basePath: organizationContentPath,
        upsert: async (role) => {
            const result = await lightdashApi<
                ApiCustomRoleAsCodeUpsertResponse['results']
            >({
                method: 'POST',
                url: `/api/v2/orgs/${organizationUuid}/code/roles`,
                body: JSON.stringify(role),
            });
            return result.action;
        },
    });

export const downloadCustomRoles = async (
    organizationUuid: string,
    organizationContentPath: string,
): Promise<number> =>
    downloadCodeResource({
        definition: CUSTOM_ROLE_CODE_RESOURCE,
        basePath: organizationContentPath,
        list: async () => {
            const { customRoles } = await lightdashApi<
                ApiCustomRoleAsCodeListResponse['results']
            >({
                method: 'GET',
                url: `/api/v2/orgs/${organizationUuid}/code/roles`,
                body: undefined,
            });
            return customRoles;
        },
    });
