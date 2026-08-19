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
import {
    downloadThemes,
    formatThemeUploadSummary,
    prepareThemeUploads,
    uploadThemes,
} from './themes';
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

const createThemePartialUploadError = (message: string): Error =>
    new CodeResourcePhaseError('theme', message);

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

    const output = createContentAsCodeOutput({
        operation: 'download',
        scope: 'organization',
    });
    try {
        const customRolesTotal = await output.runItem({
            label: 'Custom roles',
            action: () =>
                downloadCustomRoles(organizationUuid, organizationContentPath),
            detail: (total) => `${total} downloaded`,
        });
        const usersTotal = await output.runItem({
            label: 'Users',
            action: () =>
                downloadUsers(organizationUuid, organizationContentPath),
            detail: (total) => `${total} downloaded`,
        });
        let groupsTotal = 0;
        output.startItem('Groups');
        try {
            groupsTotal = await downloadGroups(
                organizationUuid,
                organizationContentPath,
            );
            output.completeItem(`${groupsTotal} downloaded`);
        } catch (error) {
            if (!isGroupServiceDisabledError(error)) {
                throw error;
            }
            output.completeItem('service unavailable', 'warning');
            GlobalState.debug(
                '> Warning: groups were not downloaded because the group service is not enabled',
            );
        }
        const themesTotal = await output.runItem({
            label: 'Themes',
            action: () => downloadThemes(organizationContentPath),
            detail: (total) => `${total} downloaded`,
        });

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
                themesNum: themesTotal,
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
    });
    try {
        const preparedThemes = await prepareThemeUploads(
            organizationContentPath,
        );
        output.startItem('Custom roles');
        const summary = await uploadCustomRoles(
            organizationUuid,
            organizationContentPath,
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
        if (summary.skipped && summary.skipped > 0) {
            GlobalState.log(
                styles.warning(
                    'Skipped custom roles because they require a Lightdash Enterprise license.',
                ),
            );
        }
        output.completeItem(
            summaryMessage,
            summary.skipped && summary.skipped > 0 ? 'warning' : undefined,
        );
        output.startItem('Users');
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
        output.completeItem(userSummaryMessage);
        output.startItem('Groups');
        const groupSummary = await uploadGroups(
            organizationUuid,
            organizationContentPath,
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
        output.completeItem(groupSummaryMessage);
        output.startItem('Themes');
        const themeSummary = await uploadThemes(preparedThemes);
        const themeSummaryMessage = formatThemeUploadSummary(themeSummary);
        if (themeSummary.failed > 0) {
            themeSummary.failures.forEach(({ message }) =>
                GlobalState.log(styles.error(message)),
            );
            if (themeSummary.completedSlugs.length > 0) {
                GlobalState.log(
                    styles.warning(
                        `Processed themes before failure: ${themeSummary.completedSlugs.join(', ')}`,
                    ),
                );
            }
            output.prepareForFailureDetails();
            throw createThemePartialUploadError(
                `Processed themes: ${themeSummaryMessage}`,
            );
        }
        output.completeItem(themeSummaryMessage);
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
                themesCreated: themeSummary.created,
                themesUpdated: themeSummary.updated,
                themesUnchanged: themeSummary.unchanged,
                themesUploaded: themeSummary.created + themeSummary.updated,
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
