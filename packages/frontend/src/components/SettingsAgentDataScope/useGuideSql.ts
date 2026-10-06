import {
    getAiQueryProcedureSql,
    getAiQueryProcedureSettingValue,
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
    aiQueryProcedureEnabled,
    procedureDatabase,
    procedureSchema,
    procedureName,
    procedureOwnerRole,
    allowedSchemas,
}: {
    aiQueryProcedureEnabled: boolean;
    procedureDatabase: string;
    procedureSchema: string;
    procedureName: string;
    procedureOwnerRole: string;
    allowedSchemas: { database: string; schema: string }[];
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
    const procedure = useMemo(() => {
        if (!aiQueryProcedureEnabled) return null;
        try {
            const options = {
                database: procedureDatabase,
                schema: procedureSchema,
                name: procedureName,
                ownerRole: procedureOwnerRole,
                aiRoles: roles
                    .split(',')
                    .map((role) => role.trim())
                    .filter(Boolean),
                allowedSchemas,
            };
            return {
                sql: getAiQueryProcedureSql(options),
                settingValue: getAiQueryProcedureSettingValue(options),
            };
        } catch {
            return null;
        }
    }, [
        aiQueryProcedureEnabled,
        procedureDatabase,
        procedureSchema,
        procedureName,
        procedureOwnerRole,
        roles,
        allowedSchemas,
    ]);
    const ceilingSql = useMemo(() => {
        try {
            return getSessionCeilingSql({
                database: tagDatabase,
                schema: tagSchema,
                blockedRoles: [],
                programUsageSchema: procedure
                    ? {
                          database: procedureDatabase,
                          schema: procedureSchema,
                      }
                    : undefined,
            });
        } catch {
            return '';
        }
    }, [tagDatabase, tagSchema, procedure, procedureDatabase, procedureSchema]);
    return { integrationSql, envBlock, maskingSql, ceilingSql, procedure };
};
