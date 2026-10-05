import {
    getAiTwinSessionCeilingSql,
    getAgenticEnvBlock,
    getAgenticIntegrationSql,
    getAgentMaskingSql,
    getSessionCeilingSql,
} from '@lightdash/common';
import { useMemo } from 'react';

export const useGuideSql = ({
    integrationName,
    redirectUri,
    roles,
    account,
    tagDatabase,
    tagSchema,
    protectedSchemas,
    aiIdentitiesEnabled,
    identityNames,
}: {
    aiIdentitiesEnabled: boolean;
    identityNames: string[];
    integrationName: string;
    redirectUri: string;
    roles: string;
    account: string;
    tagDatabase: string;
    tagSchema: string;
    protectedSchemas: { database: string; schema: string }[];
}) => {
    const integrationSql = useMemo(() => {
        try {
            return getAgenticIntegrationSql({
                integrationName,
                redirectUri,
                preAuthorizedRoles: roles
                    .split(',')
                    .map((role) => role.trim())
                    .filter(Boolean),
            });
        } catch {
            return '';
        }
    }, [integrationName, redirectUri, roles]);
    const envBlock = useMemo(() => {
        try {
            return getAgenticEnvBlock({ account });
        } catch {
            return '';
        }
    }, [account]);
    const maskingSql = useMemo(() => {
        try {
            return getAgentMaskingSql({
                tagDatabase,
                tagSchema,
                protectedSchemas,
            });
        } catch {
            return '';
        }
    }, [tagDatabase, tagSchema, protectedSchemas]);
    const ceilingSql = useMemo(() => {
        try {
            if (aiIdentitiesEnabled) {
                if (identityNames.length === 0) return '';
                return getAiTwinSessionCeilingSql({
                    database: tagDatabase,
                    schema: tagSchema,
                    blockedRoles: [],
                    twinNames: identityNames,
                });
            }
            return getSessionCeilingSql({
                database: tagDatabase,
                schema: tagSchema,
                blockedRoles: [],
            });
        } catch {
            return '';
        }
    }, [tagDatabase, tagSchema, aiIdentitiesEnabled, identityNames]);
    return { integrationSql, envBlock, maskingSql, ceilingSql };
};
