import {
    AuthorizationError,
    getErrorMessage,
    LightdashError,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/analytics';
import { type Config } from '../../config';
import GlobalState from '../../globalState';
import * as styles from '../../styles';
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

    const spinner = GlobalState.startSpinner(`Downloading custom roles`);
    try {
        const customRolesTotal = await downloadCustomRoles(
            organizationUuid,
            organizationContentPath,
        );
        spinner.succeed(`Downloaded ${customRolesTotal} custom roles`);

        spinner.start(`Downloading users`);
        const usersTotal = await downloadUsers(
            organizationUuid,
            organizationContentPath,
        );
        spinner.succeed(`Downloaded ${usersTotal} users`);

        spinner.start(`Downloading groups`);
        let groupsTotal = 0;
        try {
            groupsTotal = await downloadGroups(
                organizationUuid,
                organizationContentPath,
            );
            spinner.succeed(`Downloaded ${groupsTotal} groups`);
        } catch (error) {
            if (!isGroupServiceDisabledError(error)) {
                throw error;
            }
            spinner.stop();
            GlobalState.debug(
                '> Warning: groups were not downloaded because the group service is not enabled',
            );
        }

        GlobalState.log(
            styles.success(
                `Downloaded organization content saved to ${organizationContentPath}`,
            ),
        );

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
        spinner.fail(
            `Failed to download organization content: ${getErrorMessage(error)}`,
        );
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

    const spinner = GlobalState.startSpinner(`Uploading custom roles`);
    try {
        const summary = await uploadCustomRoles(
            organizationUuid,
            organizationContentPath,
        );
        const summaryMessage = formatCustomRoleUploadSummary(summary);
        if (summary.failed > 0) {
            summary.failures.forEach(({ message }) =>
                GlobalState.log(styles.error(message)),
            );
            spinner.stop();
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
        spinner.succeed(`Uploaded custom roles: ${summaryMessage}`);

        spinner.start(`Uploading users`);
        const userSummary = await uploadUsers(
            organizationUuid,
            organizationContentPath,
            sendInvites,
        );
        const userSummaryMessage = formatUserUploadSummary(userSummary);
        if (userSummary.failed > 0) {
            userSummary.failures.forEach(({ message }) =>
                GlobalState.log(styles.error(message)),
            );
            spinner.stop();
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
        spinner.succeed(`Uploaded users: ${userSummaryMessage}`);

        spinner.start(`Uploading groups`);
        const groupSummary = await uploadGroups(
            organizationUuid,
            organizationContentPath,
        );
        const groupSummaryMessage = formatGroupUploadSummary(groupSummary);
        if (groupSummary.failed > 0) {
            groupSummary.failures.forEach(({ message }) =>
                GlobalState.log(styles.error(message)),
            );
            spinner.stop();
            throw createGroupPartialUploadError(
                `Processed groups: ${groupSummaryMessage}`,
            );
        }
        spinner.succeed(`Uploaded groups: ${groupSummaryMessage}`);
        GlobalState.log(
            styles.success(
                `Uploaded organization content from ${organizationContentPath}`,
            ),
        );
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
        if (!isPartialUploadError(error)) {
            spinner.fail(
                `Failed to upload organization content: ${getErrorMessage(error)}`,
            );
        }
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
