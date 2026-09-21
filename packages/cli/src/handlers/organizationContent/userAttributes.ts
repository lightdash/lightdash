import {
    parseUserAttributeAsCode,
    type ApiUserAttributeAsCodeListResponse,
    type ApiUserAttributeAsCodeUpsertResponse,
    type UserAttributeAsCode,
} from '@lightdash/common';
import {
    downloadCodeResource,
    uploadCodeResource,
    type CodeResourceDefinition,
    type CodeResourceUploadSummary,
} from '../contentAsCode/resource';
import { lightdashApi } from '../dbt/apiClient';

export const USER_ATTRIBUTE_CODE_RESOURCE: CodeResourceDefinition<UserAttributeAsCode> =
    {
        kind: 'user_attribute',
        displayLabel: 'user attribute',
        identityLabel: 'name',
        scope: 'organization',
        folderName: 'user_attributes',
        acceptedExtensions: ['.yml', '.yaml'],
        fileName: {
            strategy: 'uriEncodedIdentity',
            fallbackPrefix: 'user-attribute',
            extension: '.yml',
        },
        dependencies: ['user', 'group'],
        identity: ({ name }) => name,
        displayName: ({ name }) => name,
        parse: parseUserAttributeAsCode,
        sort: (a, b) => a.name.localeCompare(b.name),
    };

export const formatUserAttributeUploadSummary = (
    summary: CodeResourceUploadSummary,
): string =>
    `${summary.created} created, ${summary.updated} updated, ${summary.unchanged} unchanged, ${summary.failed} failed`;

export const downloadUserAttributes = async (
    organizationUuid: string,
    organizationContentPath: string,
): Promise<number> =>
    downloadCodeResource({
        definition: USER_ATTRIBUTE_CODE_RESOURCE,
        basePath: organizationContentPath,
        list: async () => {
            const { userAttributes } = await lightdashApi<
                ApiUserAttributeAsCodeListResponse['results']
            >({
                method: 'GET',
                url: `/api/v2/orgs/${organizationUuid}/code/userAttributes`,
                body: undefined,
            });
            return userAttributes;
        },
    });

export const uploadUserAttributes = async (
    organizationUuid: string,
    organizationContentPath: string,
): Promise<CodeResourceUploadSummary> =>
    uploadCodeResource({
        definition: USER_ATTRIBUTE_CODE_RESOURCE,
        basePath: organizationContentPath,
        upsert: async (document) => {
            const result = await lightdashApi<
                ApiUserAttributeAsCodeUpsertResponse['results']
            >({
                method: 'POST',
                url: `/api/v2/orgs/${organizationUuid}/code/userAttributes`,
                body: JSON.stringify(document),
            });
            return result.action;
        },
    });
