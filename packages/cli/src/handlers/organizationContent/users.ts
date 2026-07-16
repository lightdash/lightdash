/* eslint-disable no-await-in-loop */
import {
    assertUnreachable,
    getErrorMessage,
    OrganizationMemberRole,
    parseUserAsCode,
    PromotionAction,
    UserAsCodeInvitationStatus,
    UserAsCodeLifecycleStatus,
    type ApiUserAsCodeListResponse,
    type ApiUserAsCodeUpsertResponse,
    type UserAsCode,
} from '@lightdash/common';
import * as path from 'path';
import {
    assertCodeResourceFilesValid,
    downloadCodeResource,
    readCodeResourceFiles,
    type CodeFileFailure,
    type CodeResourceDefinition,
} from '../contentAsCode/resource';
import { lightdashApi } from '../dbt/apiClient';

export type UserUploadFailure = CodeFileFailure;

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

export const USER_CODE_RESOURCE: CodeResourceDefinition<UserAsCode> = {
    kind: 'user',
    displayLabel: 'user',
    identityLabel: 'email',
    scope: 'organization',
    folderName: 'users',
    acceptedExtensions: ['.yml'],
    fileName: {
        strategy: 'normalizedDisplayName',
        fallbackPrefix: 'user',
        extension: '.yml',
    },
    dependencies: ['custom_role'],
    identity: ({ email }) => email,
    normalizeIdentity: (email) => email.toLowerCase(),
    displayName: ({ email }) => email.toLowerCase(),
    parse: parseUserAsCode,
    sort: (left, right) => left.email.localeCompare(right.email),
};

type UserFile = { filePath: string; document: UserAsCode };

export const getUsersFolder = (organizationContentPath: string): string =>
    path.join(organizationContentPath, USER_CODE_RESOURCE.folderName);

export const formatUserUploadSummary = (summary: UserUploadSummary): string => {
    const invitationSummary = [
        `${summary.invited} invited`,
        `${
            summary.skippedAuthenticated +
            summary.skippedDisabled +
            summary.skippedValidInvite
        } invitation-skipped`,
    ];
    return [
        `${summary.created} created`,
        `${summary.updated} updated`,
        `${summary.unchanged} unchanged`,
        `${summary.awaitingAuthentication} awaiting authentication`,
        invitationSummary.join(', '),
        `${summary.failed} failed`,
    ].join(', ');
};

export const readUserFiles = async (
    organizationContentPath: string,
): Promise<unknown[]> => {
    const result = await readCodeResourceFiles({
        definition: USER_CODE_RESOURCE,
        basePath: organizationContentPath,
    });
    assertCodeResourceFilesValid(result);
    return result.files.map(({ document }) => document);
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
    const getPriority = ({ document: desired }: UserFile): number => {
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

    return [...userFiles].sort(
        (left, right) =>
            getPriority(left) - getPriority(right) ||
            left.filePath.localeCompare(right.filePath),
    );
};

export const uploadUsers = async (
    organizationUuid: string,
    organizationContentPath: string,
    sendInvites: boolean = false,
): Promise<UserUploadSummary> => {
    const { files, failures } = await readCodeResourceFiles({
        definition: USER_CODE_RESOURCE,
        basePath: organizationContentPath,
    });
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
    if (files.length === 0) {
        summary.failed = failures.length;
        return summary;
    }

    const { users: currentUsers } = await lightdashApi<
        ApiUserAsCodeListResponse['results']
    >({
        method: 'GET',
        url: `/api/v2/orgs/${organizationUuid}/users/code`,
        body: undefined,
    });

    for (const { filePath, document } of orderUserFiles(files, currentUsers)) {
        try {
            const result = await lightdashApi<
                ApiUserAsCodeUpsertResponse['results']
            >({
                method: 'POST',
                url: `/api/v2/orgs/${organizationUuid}/users/code${sendInvites ? '?sendInvite=true' : ''}`,
                body: JSON.stringify(document),
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
                    assertUnreachable(
                        result.action,
                        'Unsupported user promotion action',
                    );
            }
            switch (result.lifecycle) {
                case UserAsCodeLifecycleStatus.READY:
                    break;
                case UserAsCodeLifecycleStatus.AWAITING_AUTHENTICATION:
                    summary.awaitingAuthentication += 1;
                    break;
                default:
                    assertUnreachable(
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
                    assertUnreachable(
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
): Promise<number> =>
    downloadCodeResource({
        definition: USER_CODE_RESOURCE,
        basePath: organizationContentPath,
        list: async () => {
            const { users } = await lightdashApi<
                ApiUserAsCodeListResponse['results']
            >({
                method: 'GET',
                url: `/api/v2/orgs/${organizationUuid}/users/code`,
                body: undefined,
            });
            return users;
        },
    });
