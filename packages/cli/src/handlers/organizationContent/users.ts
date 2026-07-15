/* eslint-disable no-await-in-loop */
import {
    ApiUserAsCodeListResponse,
    ApiUserAsCodeUpsertResponse,
    assertUnreachable,
    getErrorMessage,
    OrganizationMemberRole,
    ParameterError,
    PromotionAction,
    UserAsCode,
    UserAsCodeInvitationStatus,
    UserAsCodeLifecycleStatus,
} from '@lightdash/common';
import { createHash } from 'crypto';
import { Dirent, promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import groupBy from 'lodash/groupBy';
import * as path from 'path';
import { lightdashApi } from '../dbt/apiClient';

const USER_FILENAME_MAX_LENGTH = 200;

export type UserUploadFailure = {
    message: string;
};

export type UserUploadSummary = {
    created: number;
    updated: number;
    unchanged: number;
    awaitingAuthentication: number;
    invited: number;
    skippedAuthenticated: number;
    skippedDisabled: number;
    skippedValidInvite: number;
    failed: number;
    failures: UserUploadFailure[];
};

type UserFile = {
    filePath: string;
    user: unknown;
};

type UserFileReadResult = {
    userFiles: UserFile[];
    failures: UserUploadFailure[];
};

type UserFileReadItem =
    | { kind: 'user'; userFile: UserFile }
    | { kind: 'failure'; failure: UserUploadFailure };

export const getUsersFolder = (organizationContentPath: string): string =>
    path.join(organizationContentPath, 'users');

export const formatUserUploadSummary = (summary: UserUploadSummary): string => {
    const invitationSummary = [
        `${summary.invited} invited`,
        `${
            summary.skippedAuthenticated +
            summary.skippedDisabled +
            summary.skippedValidInvite
        } invitation-skipped`,
    ];
    return `${summary.created} created, ${summary.updated} updated, ${summary.unchanged} unchanged, ${summary.awaitingAuthentication} awaiting authentication, ${invitationSummary.join(', ')}, ${summary.failed} failed`;
};

const getUserEmail = (user: unknown): string | undefined => {
    if (typeof user !== 'object' || user === null || Array.isArray(user)) {
        return undefined;
    }
    const { email } = user as Record<string, unknown>;
    return typeof email === 'string' ? email.toLowerCase() : undefined;
};

const asUserAsCode = (user: unknown): UserAsCode | undefined => {
    if (typeof user !== 'object' || user === null || Array.isArray(user)) {
        return undefined;
    }
    const record = user as Record<string, unknown>;
    if (
        typeof record.email !== 'string' ||
        typeof record.disabled !== 'boolean' ||
        typeof record.role !== 'object' ||
        record.role === null ||
        Array.isArray(record.role)
    ) {
        return undefined;
    }
    const role = record.role as Record<string, unknown>;
    if (
        (role.type !== 'system' && role.type !== 'custom') ||
        typeof role.name !== 'string'
    ) {
        return undefined;
    }
    return user as UserAsCode;
};

const getUserFilenameBase = (email: string): string => {
    const normalizedEmail = email.toLowerCase();
    const slug = normalizedEmail
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const emailHash = createHash('sha256')
        .update(normalizedEmail)
        .digest('hex')
        .slice(0, 8);

    return (slug || `user-${emailHash}`).slice(0, USER_FILENAME_MAX_LENGTH);
};

const readUserFileResults = async (
    organizationContentPath: string,
): Promise<UserFileReadResult> => {
    const folder = getUsersFolder(organizationContentPath);
    let entries: Dirent[];
    try {
        entries = await fs.readdir(folder, { withFileTypes: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return { userFiles: [], failures: [] };
        }
        throw error;
    }

    const files = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.yml'))
        .sort((left, right) => left.name.localeCompare(right.name));
    const results = await Promise.all(
        files.map(async (file): Promise<UserFileReadItem> => {
            const filePath = path.join(folder, file.name);
            try {
                return {
                    kind: 'user',
                    userFile: {
                        filePath,
                        user: yaml.load(await fs.readFile(filePath, 'utf8')),
                    },
                };
            } catch (error) {
                return {
                    kind: 'failure',
                    failure: {
                        message: `Unable to parse user file "${filePath}": ${getErrorMessage(error)}`,
                    },
                };
            }
        }),
    );

    const parsedUserFiles = results.flatMap((result) =>
        result.kind === 'user' ? [result.userFile] : [],
    );
    const failures = results.flatMap((result) =>
        result.kind === 'failure' ? [result.failure] : [],
    );
    const emailFiles = parsedUserFiles.flatMap((userFile) => {
        const email = getUserEmail(userFile.user);
        return email === undefined ? [] : [{ email, userFile }];
    });
    const filesByEmail = groupBy(emailFiles, ({ email }) => email);
    const duplicateEmails = new Set(
        Object.entries(filesByEmail)
            .filter(([, matchingFiles]) => matchingFiles.length > 1)
            .map(([email]) => email),
    );
    for (const duplicateEmail of [...duplicateEmails].sort()) {
        for (const { userFile } of filesByEmail[duplicateEmail]) {
            failures.push({
                message: `Duplicate user email "${duplicateEmail}" in "${userFile.filePath}"`,
            });
        }
    }

    return {
        userFiles: parsedUserFiles.filter(
            ({ user }) => !duplicateEmails.has(getUserEmail(user) ?? ''),
        ),
        failures,
    };
};

export const readUserFiles = async (
    organizationContentPath: string,
): Promise<unknown[]> => {
    const { userFiles, failures } = await readUserFileResults(
        organizationContentPath,
    );
    if (failures.length > 0) {
        throw new ParameterError(
            failures.map(({ message }) => message).join('\n'),
        );
    }
    return userFiles.map(({ user }) => user);
};

const isSystemAdmin = (user: UserAsCode): boolean =>
    user.role.type === 'system' &&
    user.role.name === OrganizationMemberRole.ADMIN;

const orderUserFiles = (
    userFiles: UserFile[],
    currentUsers: UserAsCode[],
): UserFile[] => {
    const currentByEmail = new Map(
        currentUsers.map((user) => [user.email.toLowerCase(), user]),
    );

    return [...userFiles].sort((left, right) => {
        const getPriority = (userFile: UserFile): number => {
            const desired = asUserAsCode(userFile.user);
            if (!desired) return 1;
            const current = currentByEmail.get(desired.email.toLowerCase());
            if (isSystemAdmin(desired) && !desired.disabled) return 0;
            if (
                current &&
                isSystemAdmin(current) &&
                !current.disabled &&
                (!isSystemAdmin(desired) || desired.disabled)
            ) {
                return 2;
            }
            return 1;
        };

        return (
            getPriority(left) - getPriority(right) ||
            left.filePath.localeCompare(right.filePath)
        );
    });
};

export const uploadUsers = async (
    organizationUuid: string,
    organizationContentPath: string,
    sendInvites: boolean = false,
): Promise<UserUploadSummary> => {
    const { userFiles, failures } = await readUserFileResults(
        organizationContentPath,
    );
    const summary: UserUploadSummary = {
        created: 0,
        updated: 0,
        unchanged: 0,
        awaitingAuthentication: 0,
        invited: 0,
        skippedAuthenticated: 0,
        skippedDisabled: 0,
        skippedValidInvite: 0,
        failed: 0,
        failures,
    };

    if (userFiles.length === 0) {
        summary.failed = summary.failures.length;
        return summary;
    }

    const { users: currentUsers } = await lightdashApi<
        ApiUserAsCodeListResponse['results']
    >({
        method: 'GET',
        url: `/api/v2/orgs/${organizationUuid}/users/code`,
        body: undefined,
    });

    for (const { filePath, user } of orderUserFiles(userFiles, currentUsers)) {
        try {
            const result = await lightdashApi<
                ApiUserAsCodeUpsertResponse['results']
            >({
                method: 'POST',
                url: `/api/v2/orgs/${organizationUuid}/users/code${
                    sendInvites ? '?sendInvite=true' : ''
                }`,
                body: JSON.stringify(user),
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
                        `Unsupported user promotion action: ${result.action}`,
                    );
            }
            switch (result.lifecycle) {
                case UserAsCodeLifecycleStatus.READY:
                    break;
                case UserAsCodeLifecycleStatus.AWAITING_AUTHENTICATION:
                    summary.awaitingAuthentication += 1;
                    break;
                default:
                    return assertUnreachable(
                        result.lifecycle,
                        'Unsupported user lifecycle status',
                    );
            }
            switch (result.invitation) {
                case UserAsCodeInvitationStatus.NOT_REQUESTED:
                    break;
                case UserAsCodeInvitationStatus.SENT:
                    summary.invited += 1;
                    break;
                case UserAsCodeInvitationStatus.SKIPPED_AUTHENTICATED:
                    summary.skippedAuthenticated += 1;
                    break;
                case UserAsCodeInvitationStatus.SKIPPED_DISABLED:
                    summary.skippedDisabled += 1;
                    break;
                case UserAsCodeInvitationStatus.SKIPPED_VALID_INVITE:
                    summary.skippedValidInvite += 1;
                    break;
                default:
                    return assertUnreachable(
                        result.invitation,
                        'Unsupported user invitation status',
                    );
            }
        } catch (error) {
            summary.failures.push({
                message: `Invalid user file "${filePath}": ${getErrorMessage(error)}`,
            });
        }
    }

    summary.failed = summary.failures.length;
    return summary;
};

export const downloadUsers = async (
    organizationUuid: string,
    organizationContentPath: string,
): Promise<number> => {
    const { users } = await lightdashApi<ApiUserAsCodeListResponse['results']>({
        method: 'GET',
        url: `/api/v2/orgs/${organizationUuid}/users/code`,
        body: undefined,
    });
    const folder = getUsersFolder(organizationContentPath);
    await fs.mkdir(folder, { recursive: true });

    const existingFiles = await fs.readdir(folder, { withFileTypes: true });
    await Promise.all(
        existingFiles
            .filter((entry) => entry.isFile() && entry.name.endsWith('.yml'))
            .map((entry) => fs.unlink(path.join(folder, entry.name))),
    );

    const sortedUsers = [...users].sort((left, right) =>
        left.email.localeCompare(right.email),
    );
    const filenameBases = sortedUsers.map(({ email }) =>
        getUserFilenameBase(email),
    );
    const baseCounts = filenameBases.reduce<Record<string, number>>(
        (counts, filenameBase) => ({
            ...counts,
            [filenameBase]: (counts[filenameBase] ?? 0) + 1,
        }),
        {},
    );

    await Promise.all(
        sortedUsers.map(async (user, index) => {
            const filenameBase = filenameBases[index];
            const collisionSuffix = `-${createHash('sha256')
                .update(user.email.toLowerCase())
                .digest('hex')
                .slice(0, 8)}`;
            const uniqueFilenameBase =
                baseCounts[filenameBase] > 1
                    ? `${filenameBase.slice(
                          0,
                          USER_FILENAME_MAX_LENGTH - collisionSuffix.length,
                      )}${collisionSuffix}`
                    : filenameBase;

            await fs.writeFile(
                path.join(folder, `${uniqueFilenameBase}.yml`),
                yaml.dump(user, { quotingType: '"', sortKeys: true }),
            );
        }),
    );

    return sortedUsers.length;
};
