/* eslint-disable no-await-in-loop */
import {
    ApiCustomRoleAsCodeListResponse,
    ApiCustomRoleAsCodeUpsertResponse,
    CustomRoleAsCode,
    getErrorMessage,
    ParameterError,
    PromotionAction,
} from '@lightdash/common';
import { Dirent, promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import groupBy from 'lodash/groupBy';
import * as path from 'path';
import { lightdashApi } from '../dbt/apiClient';
import { getOrganizationContentFileNames } from './fileNames';

export type CustomRoleUploadFailure = {
    message: string;
};

export type CustomRoleUploadSummary = {
    created: number;
    updated: number;
    unchanged: number;
    failed: number;
    failures: CustomRoleUploadFailure[];
};

type CustomRoleFile = {
    filePath: string;
    role: unknown;
};

type CustomRoleFileReadResult = {
    roleFiles: CustomRoleFile[];
    failures: CustomRoleUploadFailure[];
};

type CustomRoleFileReadItem =
    | { kind: 'role'; roleFile: CustomRoleFile }
    | { kind: 'failure'; failure: CustomRoleUploadFailure };

export const getCustomRolesFolder = (organizationContentPath: string): string =>
    path.join(organizationContentPath, 'custom-roles');

export const formatCustomRoleUploadSummary = (
    summary: CustomRoleUploadSummary,
): string =>
    `${summary.created} created, ${summary.updated} updated, ${summary.unchanged} unchanged, ${summary.failed} failed`;

const getCustomRoleName = (role: unknown): string | undefined => {
    if (typeof role !== 'object' || role === null || Array.isArray(role)) {
        return undefined;
    }
    return typeof (role as Record<string, unknown>).name === 'string'
        ? ((role as Record<string, unknown>).name as string)
        : undefined;
};

const readCustomRoleFileResults = async (
    organizationContentPath: string,
): Promise<CustomRoleFileReadResult> => {
    const folder = getCustomRolesFolder(organizationContentPath);
    let entries: Dirent[];
    try {
        entries = await fs.readdir(folder, { withFileTypes: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return { roleFiles: [], failures: [] };
        }
        throw error;
    }

    const files = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.yml'))
        .sort((left, right) => left.name.localeCompare(right.name));
    const results = await Promise.all(
        files.map(async (file): Promise<CustomRoleFileReadItem> => {
            const filePath = path.join(folder, file.name);
            try {
                return {
                    kind: 'role',
                    roleFile: {
                        filePath,
                        role: yaml.load(await fs.readFile(filePath, 'utf8')),
                    },
                };
            } catch (error) {
                return {
                    kind: 'failure',
                    failure: {
                        message: `Unable to parse custom role file "${filePath}": ${getErrorMessage(error)}`,
                    },
                };
            }
        }),
    );

    const parsedRoleFiles = results.flatMap((result) =>
        result.kind === 'role' ? [result.roleFile] : [],
    );
    const failures = results.flatMap((result) =>
        result.kind === 'failure' ? [result.failure] : [],
    );
    const namedRoleFiles = parsedRoleFiles.flatMap((roleFile) => {
        const name = getCustomRoleName(roleFile.role);
        return name === undefined ? [] : [{ name, roleFile }];
    });
    const roleFilesByName = groupBy(namedRoleFiles, ({ name }) => name);
    const duplicateNames = new Set(
        Object.entries(roleFilesByName)
            .filter(([, roleFiles]) => roleFiles.length > 1)
            .map(([name]) => name),
    );
    for (const duplicateName of [...duplicateNames].sort()) {
        for (const { roleFile } of roleFilesByName[duplicateName]) {
            failures.push({
                message: `Duplicate custom role name "${duplicateName}" in "${roleFile.filePath}"`,
            });
        }
    }

    return {
        roleFiles: parsedRoleFiles.filter(
            ({ role }) => !duplicateNames.has(getCustomRoleName(role) ?? ''),
        ),
        failures,
    };
};

export const readCustomRoleFiles = async (
    organizationContentPath: string,
): Promise<unknown[]> => {
    const { roleFiles, failures } = await readCustomRoleFileResults(
        organizationContentPath,
    );
    if (failures.length > 0) {
        throw new ParameterError(
            failures.map(({ message }) => message).join('\n'),
        );
    }
    return roleFiles.map(({ role }) => role);
};

export const uploadCustomRoles = async (
    organizationUuid: string,
    organizationContentPath: string,
): Promise<CustomRoleUploadSummary> => {
    const { roleFiles, failures } = await readCustomRoleFileResults(
        organizationContentPath,
    );
    const summary: CustomRoleUploadSummary = {
        created: 0,
        updated: 0,
        unchanged: 0,
        failed: 0,
        failures,
    };

    for (const { filePath, role } of roleFiles) {
        try {
            const result = await lightdashApi<
                ApiCustomRoleAsCodeUpsertResponse['results']
            >({
                method: 'POST',
                url: `/api/v2/orgs/${organizationUuid}/roles/code`,
                body: JSON.stringify(role),
            });
            switch (result.action) {
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
                    throw new ParameterError(
                        `Unsupported custom role promotion action: ${result.action}`,
                    );
            }
        } catch (error) {
            summary.failures.push({
                message: `Invalid custom role file "${filePath}": ${getErrorMessage(error)}`,
            });
        }
    }

    summary.failed = summary.failures.length;
    return summary;
};

export const downloadCustomRoles = async (
    organizationUuid: string,
    organizationContentPath: string,
): Promise<number> => {
    const { customRoles } = await lightdashApi<
        ApiCustomRoleAsCodeListResponse['results']
    >({
        method: 'GET',
        url: `/api/v2/orgs/${organizationUuid}/roles/code`,
        body: undefined,
    });
    const folder = getCustomRolesFolder(organizationContentPath);
    await fs.mkdir(folder, { recursive: true });

    const existingFiles = await fs.readdir(folder, { withFileTypes: true });
    await Promise.all(
        existingFiles
            .filter((entry) => entry.isFile() && entry.name.endsWith('.yml'))
            .map((entry) => fs.unlink(path.join(folder, entry.name))),
    );

    const filenames = getOrganizationContentFileNames({
        values: customRoles.map(({ name }) => name),
        fallbackPrefix: 'role',
    });

    await Promise.all(
        customRoles.map(async (role: CustomRoleAsCode, index) => {
            await fs.writeFile(
                path.join(folder, filenames[index]),
                yaml.dump(role, { quotingType: '"', sortKeys: true }),
            );
        }),
    );

    return customRoles.length;
};
