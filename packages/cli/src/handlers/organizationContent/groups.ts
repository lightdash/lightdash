/* eslint-disable no-await-in-loop */
import {
    ApiGroupAsCodeListResponse,
    ApiGroupAsCodeUpsertResponse,
    getErrorMessage,
    GroupAsCode,
    ParameterError,
    PromotionAction,
} from '@lightdash/common';
import { Dirent, promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import groupBy from 'lodash/groupBy';
import * as path from 'path';
import { lightdashApi } from '../dbt/apiClient';
import { getOrganizationContentFileNames } from './fileNames';

export type GroupUploadFailure = {
    message: string;
};

export type GroupUploadSummary = {
    created: number;
    updated: number;
    unchanged: number;
    failed: number;
    dependencySkipped: number;
    failures: GroupUploadFailure[];
};

type GroupFile = {
    filePath: string;
    group: unknown;
};

type GroupFileReadResult = {
    groupFiles: GroupFile[];
    failures: GroupUploadFailure[];
};

type GroupFileReadItem =
    | { kind: 'group'; groupFile: GroupFile }
    | { kind: 'failure'; failure: GroupUploadFailure };

export const getGroupsFolder = (organizationContentPath: string): string =>
    path.join(organizationContentPath, 'groups');

export const formatGroupUploadSummary = (summary: GroupUploadSummary): string =>
    `${summary.created} created, ${summary.updated} updated, ${summary.unchanged} unchanged, ${summary.failed} failed, ${summary.dependencySkipped} dependency-skipped`;

const getGroupName = (group: unknown): string | undefined => {
    if (typeof group !== 'object' || group === null || Array.isArray(group)) {
        return undefined;
    }
    const { name } = group as Record<string, unknown>;
    return typeof name === 'string' ? name : undefined;
};

const readGroupFileResults = async (
    organizationContentPath: string,
): Promise<GroupFileReadResult> => {
    const folder = getGroupsFolder(organizationContentPath);
    let entries: Dirent[];
    try {
        entries = await fs.readdir(folder, { withFileTypes: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return { groupFiles: [], failures: [] };
        }
        throw error;
    }

    const files = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.yml'))
        .sort((left, right) => left.name.localeCompare(right.name));
    const results = await Promise.all(
        files.map(async (file): Promise<GroupFileReadItem> => {
            const filePath = path.join(folder, file.name);
            try {
                return {
                    kind: 'group',
                    groupFile: {
                        filePath,
                        group: yaml.load(await fs.readFile(filePath, 'utf8')),
                    },
                };
            } catch (error) {
                return {
                    kind: 'failure',
                    failure: {
                        message: `Unable to parse group file "${filePath}": ${getErrorMessage(error)}`,
                    },
                };
            }
        }),
    );

    const parsedGroupFiles = results.flatMap((result) =>
        result.kind === 'group' ? [result.groupFile] : [],
    );
    const failures = results.flatMap((result) =>
        result.kind === 'failure' ? [result.failure] : [],
    );
    const namedGroupFiles = parsedGroupFiles.flatMap((groupFile) => {
        const name = getGroupName(groupFile.group);
        return name === undefined ? [] : [{ name, groupFile }];
    });
    const filesByName = groupBy(namedGroupFiles, ({ name }) => name);
    const duplicateNames = new Set(
        Object.entries(filesByName)
            .filter(([, matchingFiles]) => matchingFiles.length > 1)
            .map(([name]) => name),
    );
    for (const duplicateName of [...duplicateNames].sort()) {
        for (const { groupFile } of filesByName[duplicateName]) {
            failures.push({
                message: `Duplicate group name "${duplicateName}" in "${groupFile.filePath}"`,
            });
        }
    }

    return {
        groupFiles: parsedGroupFiles.filter(
            ({ group }) => !duplicateNames.has(getGroupName(group) ?? ''),
        ),
        failures,
    };
};

export const readGroupFiles = async (
    organizationContentPath: string,
): Promise<unknown[]> => {
    const { groupFiles, failures } = await readGroupFileResults(
        organizationContentPath,
    );
    if (failures.length > 0) {
        throw new ParameterError(
            failures.map(({ message }) => message).join('\n'),
        );
    }
    return groupFiles.map(({ group }) => group);
};

export const countDependencySkippedGroups = async (
    organizationContentPath: string,
): Promise<number> => {
    const folder = getGroupsFolder(organizationContentPath);
    try {
        const entries = await fs.readdir(folder, { withFileTypes: true });
        return entries.filter(
            (entry) => entry.isFile() && entry.name.endsWith('.yml'),
        ).length;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return 0;
        }
        throw error;
    }
};

export const uploadGroups = async (
    organizationUuid: string,
    organizationContentPath: string,
): Promise<GroupUploadSummary> => {
    const { groupFiles, failures } = await readGroupFileResults(
        organizationContentPath,
    );
    const summary: GroupUploadSummary = {
        created: 0,
        updated: 0,
        unchanged: 0,
        failed: 0,
        dependencySkipped: 0,
        failures,
    };

    for (const { filePath, group } of groupFiles) {
        try {
            const result = await lightdashApi<
                ApiGroupAsCodeUpsertResponse['results']
            >({
                method: 'POST',
                url: `/api/v2/orgs/${organizationUuid}/groups/code`,
                body: JSON.stringify(group),
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
                        `Unsupported group promotion action: ${result.action}`,
                    );
            }
        } catch (error) {
            summary.failures.push({
                message: `Invalid group file "${filePath}": ${getErrorMessage(error)}`,
            });
        }
    }

    summary.failed = summary.failures.length;
    return summary;
};

export const downloadGroups = async (
    organizationUuid: string,
    organizationContentPath: string,
): Promise<number> => {
    const { groups } = await lightdashApi<
        ApiGroupAsCodeListResponse['results']
    >({
        method: 'GET',
        url: `/api/v2/orgs/${organizationUuid}/groups/code`,
        body: undefined,
    });
    const folder = getGroupsFolder(organizationContentPath);
    await fs.mkdir(folder, { recursive: true });

    const existingFiles = await fs.readdir(folder, { withFileTypes: true });
    await Promise.all(
        existingFiles
            .filter((entry) => entry.isFile() && entry.name.endsWith('.yml'))
            .map((entry) => fs.unlink(path.join(folder, entry.name))),
    );

    const sortedGroups = [...groups]
        .map((group) => ({
            ...group,
            members: [...group.members].sort(),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
    const filenames = getOrganizationContentFileNames({
        values: sortedGroups.map(({ name }) => name),
        fallbackPrefix: 'group',
    });

    await Promise.all(
        sortedGroups.map(async (group: GroupAsCode, index) => {
            await fs.writeFile(
                path.join(folder, filenames[index]),
                yaml.dump(group, { quotingType: '"', sortKeys: true }),
            );
        }),
    );

    return sortedGroups.length;
};
