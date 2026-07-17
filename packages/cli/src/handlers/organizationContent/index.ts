import {
    AuthorizationError,
    getErrorMessage,
    LightdashError,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/analytics';
import { type Config } from '../../config';
import GlobalState from '../../globalState';
import * as styles from '../../styles';
import { createContentAsCodeOutput } from '../../terminal/contentAsCodeOutput';
import {
    assertCodeResourceDependencyOrder,
    ORGANIZATION_CODE_RESOURCES,
} from '../contentAsCode/registry';
import {
    CodeResourcePhaseError,
    isCodeResourcePhaseError,
} from '../contentAsCode/resource';
import { getDownloadFolder } from '../contentAsCodePaths';
import {
    downloadCustomRoles,
    formatCustomRoleUploadSummary,
    uploadCustomRoles,
} from './customRoles';
import {
    countDependencySkippedGroups,
    downloadGroups,
    formatGroupUploadSummary,
    uploadGroups,
} from './groups';
import { downloadUsers, formatUserUploadSummary, uploadUsers } from './users';

type OrganizationContentOptions = {
    customPath?: string;
    config: Config;
    sendInvites?: boolean;
};

const createCustomRolePartialUploadError = (message: string): Error =>
    new CodeResourcePhaseError('custom_role', message);

const createUserPartialUploadError = (message: string): Error =>
    new CodeResourcePhaseError('user', message);

const createGroupPartialUploadError = (message: string): Error =>
    new CodeResourcePhaseError('group', message);

const isPartialUploadError = isCodeResourcePhaseError;

const isGroupServiceDisabledError = (error: unknown): boolean =>
    error instanceof LightdashError &&
    error.statusCode === 403 &&
    error.message === 'Group service is not enabled';

const getElapsedMilliseconds = (startedAt: number): number =>
    Date.now() - startedAt;

const measureAction = async <T>(
    action: () => Promise<T>,
): Promise<{ value: T; durationMs: number }> => {
    const startedAt = Date.now();
    const value = await action();
    return { value, durationMs: getElapsedMilliseconds(startedAt) };
};

export const getOrganizationContentFolder = (customPath?: string): string =>
    getDownloadFolder(customPath);

export const downloadOrganizationContent = async ({
    customPath,
    config,
}: OrganizationContentOptions): Promise<void> => {
    const organizationUuid = config.user?.organizationUuid;
    if (!organizationUuid) {
        throw new AuthorizationError(
            `No organization selected. Log in again with 'lightdash login'.`,
        );
    }

    const organizationContentPath = getOrganizationContentFolder(customPath);
    const start = Date.now();
    await LightdashAnalytics.track({
        event: 'download.started',
        properties: {
            userId: config.user?.userUuid,
            organizationId: organizationUuid,
            scope: 'organization',
        },
    });

    const output = createContentAsCodeOutput({
        operation: 'download',
        scope: 'organization',
        initialLabel: 'Custom roles',
    });
    try {
        const { value: customRolesTotal, durationMs: customRolesDurationMs } =
            await measureAction(() =>
                downloadCustomRoles(organizationUuid, organizationContentPath),
            );
        output.completeItem(
            {
                label: 'Custom roles',
                detail: `${customRolesTotal} downloaded`,
                durationMs: customRolesDurationMs,
            },
            'Users',
        );
        const { value: usersTotal, durationMs: usersDurationMs } =
            await measureAction(() =>
                downloadUsers(organizationUuid, organizationContentPath),
            );
        output.completeItem(
            {
                label: 'Users',
                detail: `${usersTotal} downloaded`,
                durationMs: usersDurationMs,
            },
            'Groups',
        );
        const groupsStartedAt = Date.now();
        let groupsTotal = 0;
        let groupsDurationMs: number;
        try {
            groupsTotal = await downloadGroups(
                organizationUuid,
                organizationContentPath,
            );
            groupsDurationMs = getElapsedMilliseconds(groupsStartedAt);
            output.completeItem(
                {
                    label: 'Groups',
                    detail: `${groupsTotal} downloaded`,
                    durationMs: groupsDurationMs,
                },
                null,
            );
        } catch (error) {
            groupsDurationMs = getElapsedMilliseconds(groupsStartedAt);
            if (!isGroupServiceDisabledError(error)) {
                throw error;
            }
            output.completeItem(
                {
                    label: 'Groups',
                    detail: 'service unavailable',
                    durationMs: groupsDurationMs,
                    variant: 'warning',
                },
                null,
            );
            GlobalState.debug(
                '> Warning: groups were not downloaded because the group service is not enabled',
            );
        }

        const renderedSummary = output.complete(
            organizationContentPath,
            (Date.now() - start) / 1000,
        );
        if (!renderedSummary) {
            GlobalState.log(
                styles.success(
                    `Downloaded organization content saved to ${organizationContentPath}`,
                ),
            );
        }

        await LightdashAnalytics.track({
            event: 'download.completed',
            properties: {
                userId: config.user?.userUuid,
                organizationId: organizationUuid,
                scope: 'organization',
                customRolesNum: customRolesTotal,
                usersNum: usersTotal,
                groupsNum: groupsTotal,
                timeToCompleted: (Date.now() - start) / 1000,
            },
        });
    } catch (error) {
        output.fail(getErrorMessage(error), (Date.now() - start) / 1000, true);
        await LightdashAnalytics.track({
            event: 'download.error',
            properties: {
                userId: config.user?.userUuid,
                organizationId: organizationUuid,
                scope: 'organization',
                error: getErrorMessage(error),
            },
        });
        throw error;
    }
};

export const uploadOrganizationContent = async ({
    customPath,
    config,
    sendInvites = false,
}: OrganizationContentOptions): Promise<void> => {
    assertCodeResourceDependencyOrder(ORGANIZATION_CODE_RESOURCES);
    const organizationUuid = config.user?.organizationUuid;
    if (!organizationUuid) {
        throw new AuthorizationError(
            `No organization selected. Log in again with 'lightdash login'.`,
        );
    }

    const organizationContentPath = getOrganizationContentFolder(customPath);
    const start = Date.now();
    await LightdashAnalytics.track({
        event: 'upload.started',
        properties: {
            userId: config.user?.userUuid,
            organizationId: organizationUuid,
            scope: 'organization',
        },
    });

    const output = createContentAsCodeOutput({
        operation: 'upload',
        scope: 'organization',
        initialLabel: 'Custom roles',
    });
    try {
        const { value: summary, durationMs: customRolesDurationMs } =
            await measureAction(() =>
                uploadCustomRoles(organizationUuid, organizationContentPath),
            );
        const summaryMessage = formatCustomRoleUploadSummary(summary);
        if (summary.failed > 0) {
            summary.failures.forEach(({ message }) =>
                GlobalState.log(styles.error(message)),
            );
            output.prepareForFailureDetails();
            const skippedGroups = await countDependencySkippedGroups(
                organizationContentPath,
            );
            GlobalState.log(
                styles.warning(
                    `Skipped users and ${skippedGroups} groups because custom roles failed`,
                ),
            );
            throw createCustomRolePartialUploadError(
                `Processed custom roles: ${summaryMessage}`,
            );
        }
        output.completeItem(
            {
                label: 'Custom roles',
                detail: summaryMessage,
                durationMs: customRolesDurationMs,
            },
            'Users',
        );
        const { value: userSummary, durationMs: usersDurationMs } =
            await measureAction(() =>
                uploadUsers(
                    organizationUuid,
                    organizationContentPath,
                    sendInvites,
                ),
            );
        const userSummaryMessage = formatUserUploadSummary(userSummary);
        if (userSummary.failed > 0) {
            userSummary.failures.forEach(({ message }) =>
                GlobalState.log(styles.error(message)),
            );
            output.prepareForFailureDetails();
            const skippedGroups = await countDependencySkippedGroups(
                organizationContentPath,
            );
            GlobalState.log(
                styles.warning(
                    `Skipped ${skippedGroups} groups because users failed`,
                ),
            );
            throw createUserPartialUploadError(
                `Processed users: ${userSummaryMessage}`,
            );
        }
        output.completeItem(
            {
                label: 'Users',
                detail: userSummaryMessage,
                durationMs: usersDurationMs,
            },
            'Groups',
        );
        const { value: groupSummary, durationMs: groupsDurationMs } =
            await measureAction(() =>
                uploadGroups(organizationUuid, organizationContentPath),
            );
        const groupSummaryMessage = formatGroupUploadSummary(groupSummary);
        if (groupSummary.failed > 0) {
            groupSummary.failures.forEach(({ message }) =>
                GlobalState.log(styles.error(message)),
            );
            output.prepareForFailureDetails();
            throw createGroupPartialUploadError(
                `Processed groups: ${groupSummaryMessage}`,
            );
        }
        output.completeItem(
            {
                label: 'Groups',
                detail: groupSummaryMessage,
                durationMs: groupsDurationMs,
            },
            null,
        );
        const renderedSummary = output.complete(
            organizationContentPath,
            (Date.now() - start) / 1000,
        );
        if (!renderedSummary) {
            GlobalState.log(
                styles.success(
                    `Uploaded organization content from ${organizationContentPath}`,
                ),
            );
        }
        await LightdashAnalytics.track({
            event: 'upload.completed',
            properties: {
                userId: config.user?.userUuid,
                organizationId: organizationUuid,
                scope: 'organization',
                customRolesCreated: summary.created,
                customRolesUpdated: summary.updated,
                customRolesUnchanged: summary.unchanged,
                usersCreated: userSummary.created,
                usersUpdated: userSummary.updated,
                usersUnchanged: userSummary.unchanged,
                usersAwaitingAuthentication: userSummary.awaitingAuthentication,
                usersInvited: userSummary.invited,
                groupsCreated: groupSummary.created,
                groupsUpdated: groupSummary.updated,
                groupsUnchanged: groupSummary.unchanged,
                timeToCompleted: (Date.now() - start) / 1000,
            },
        });
    } catch (error) {
        output.fail(
            getErrorMessage(error),
            (Date.now() - start) / 1000,
            !isPartialUploadError(error),
        );
        await LightdashAnalytics.track({
            event: 'upload.error',
            properties: {
                userId: config.user?.userUuid,
                organizationId: organizationUuid,
                scope: 'organization',
                error: getErrorMessage(error),
            },
        });
        throw error;
    }
};
