import {
    AuthorizationError,
    getErrorMessage,
    ParameterError,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/analytics';
import { type Config } from '../../config';
import GlobalState from '../../globalState';
import * as styles from '../../styles';
import { getDownloadFolder } from '../contentAsCodePaths';
import {
    downloadCustomRoles,
    formatCustomRoleUploadSummary,
    uploadCustomRoles,
} from './customRoles';

type OrganizationContentOptions = {
    customPath?: string;
    config: Config;
};

const customRolePartialUploadErrors = new WeakSet<Error>();

const createCustomRolePartialUploadError = (message: string): Error => {
    const error = new ParameterError(message);
    customRolePartialUploadErrors.add(error);
    return error;
};

const isCustomRolePartialUploadError = (error: unknown): boolean =>
    error instanceof Error && customRolePartialUploadErrors.has(error);

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
            throw createCustomRolePartialUploadError(
                `Processed custom roles: ${summaryMessage}`,
            );
        }
        spinner.succeed(`Uploaded custom roles: ${summaryMessage}`);
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
                timeToCompleted: (Date.now() - start) / 1000,
            },
        });
    } catch (error) {
        if (!isCustomRolePartialUploadError(error)) {
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
