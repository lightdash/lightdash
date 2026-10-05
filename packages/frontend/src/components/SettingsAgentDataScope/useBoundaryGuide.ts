import {
    UserWarehouseCredentialPurpose,
    type ApiError,
    type SnowflakeAiBoundaryCheck,
    type SnowflakeAiBoundaryGuideConfig,
    type SnowflakeAiBoundaryTestBody,
} from '@lightdash/common';
import { useLocalStorage } from '@mantine/hooks';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { lightdashApi } from '../../api';
import { useTables } from '../../features/sqlRunner/hooks/useTables';
import useHealth from '../../hooks/health/useHealth';
import {
    useAiAccessRestrictions,
    useProjectUpdateAiAccessRestrictions,
} from '../../hooks/useProject';
import { useUserWarehouseCredentials } from '../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import { useSnowflakeAiLoginPopup } from '../../hooks/useSnowflake';
import { useGuideSql } from './useGuideSql';
export const useBoundaryGuide = ({
    projectUuid,
    isSnowflake,
    showAiAccessRestrictions,
}: {
    projectUuid: string;
    isSnowflake: boolean;
    showAiAccessRestrictions: boolean;
}) => {
    const [active, setActive] = useState(0);
    const [enterpriseConfirmed, setEnterpriseConfirmed] = useLocalStorage({
        key: `snowflake-ai-boundary:${projectUuid}:enterprise-confirmed`,
        defaultValue: false,
    });
    const [roleConfirmed, setRoleConfirmed] = useLocalStorage({
        key: `snowflake-ai-boundary:${projectUuid}:role-confirmed`,
        defaultValue: false,
    });
    const [integrationName, setIntegrationName] = useState('LIGHTDASH_AI');
    const [roles, setRoles] = useState('ANALYST');
    const [accountInput, setAccount] = useState<string | null>(null);
    const [tagDatabase, setTagDatabase] = useLocalStorage({
        key: `snowflake-ai-boundary:${projectUuid}:tag-database`,
        defaultValue: '',
    });
    const [tagSchema, setTagSchema] = useLocalStorage({
        key: `snowflake-ai-boundary:${projectUuid}:tag-schema`,
        defaultValue: '',
    });
    const [schemaFilter, setSchemaFilter] = useState('_CLEAR');
    const [selectedSchemas, setSelectedSchemas] = useLocalStorage<string[]>({
        key: `snowflake-ai-boundary:${projectUuid}:selected-schemas`,
        defaultValue: [],
    });
    const [confirmedMaskingSql, setConfirmedMaskingSql] = useLocalStorage({
        key: `snowflake-ai-boundary:${projectUuid}:confirmed-masking-sql`,
        defaultValue: '',
    });
    const [confirmedCeilingSql, setConfirmedCeilingSql] = useLocalStorage({
        key: `snowflake-ai-boundary:${projectUuid}:confirmed-ceiling-sql`,
        defaultValue: '',
    });
    const [protectedColumn, setProtectedColumn] = useState({
        database: '',
        schema: '',
        table: '',
        column: '',
    });
    const [checks, setChecks] = useState<SnowflakeAiBoundaryCheck[] | null>(
        null,
    );
    const [testError, setTestError] = useState('');
    const { data: health } = useHealth();
    const { data: credentials } = useUserWarehouseCredentials();
    const { data: catalog } = useTables({ projectUuid });
    const { data: restrictions } = useAiAccessRestrictions(
        projectUuid,
        showAiAccessRestrictions,
    );
    const updateRestrictions =
        useProjectUpdateAiAccessRestrictions(projectUuid);
    const login = useSnowflakeAiLoginPopup();
    const config = useQuery<SnowflakeAiBoundaryGuideConfig, ApiError>(
        ['snowflake-ai-boundary-guide', projectUuid],
        () =>
            lightdashApi<SnowflakeAiBoundaryGuideConfig>({
                url: `/projects/${projectUuid}/ai-boundary/guide`,
                method: 'GET',
                body: undefined,
            }),
        { enabled: isSnowflake },
    );
    const account = accountInput ?? config.data?.snowflakeAccount ?? '';
    const test = useMutation<
        SnowflakeAiBoundaryCheck[],
        ApiError,
        SnowflakeAiBoundaryTestBody
    >({
        mutationFn: (body) =>
            lightdashApi<SnowflakeAiBoundaryCheck[]>({
                url: `/projects/${projectUuid}/ai-boundary/test`,
                method: 'POST',
                body: JSON.stringify(body),
            }),
        onSuccess: (result) => {
            setChecks(result);
            setTestError('');
        },
        onError: (error) => setTestError(error.error.message),
    });
    const signedIn =
        credentials?.some(
            (credential) =>
                credential.purpose === UserWarehouseCredentialPurpose.AI &&
                credential.credentials.type === 'snowflake',
        ) ?? false;
    const schemas = useMemo(
        () =>
            Object.entries(catalog ?? {}).flatMap(([database, items]) =>
                Object.keys(items).map((schema) => ({
                    database,
                    schema,
                    key: JSON.stringify([database, schema]),
                    label: `${database}.${schema}`,
                })),
            ),
        [catalog],
    );
    const selectedSchemaSet = useMemo(
        () => new Set(selectedSchemas),
        [selectedSchemas],
    );
    const protectedSchemas = useMemo(
        () => schemas.filter((item) => selectedSchemaSet.has(item.key)),
        [schemas, selectedSchemaSet],
    );
    const { integrationSql, envBlock, maskingSql, ceilingSql } = useGuideSql({
        integrationName,
        redirectUri: config.data?.redirectUri ?? '',
        roles,
        account,
        tagDatabase,
        tagSchema,
        protectedSchemas,
    });
    const maskingConfirmed =
        maskingSql !== '' &&
        protectedSchemas.length > 0 &&
        confirmedMaskingSql === maskingSql;
    const ceilingConfirmed =
        ceilingSql !== '' && confirmedCeilingSql === ceilingSql;
    return {
        active,
        setActive,
        enterpriseConfirmed,
        setEnterpriseConfirmed,
        roleConfirmed,
        setRoleConfirmed,
        integrationName,
        setIntegrationName,
        roles,
        setRoles,
        accountInput,
        setAccount,
        tagDatabase,
        setTagDatabase,
        tagSchema,
        setTagSchema,
        schemaFilter,
        setSchemaFilter,
        selectedSchemas,
        setSelectedSchemas,
        confirmedMaskingSql,
        setConfirmedMaskingSql,
        confirmedCeilingSql,
        setConfirmedCeilingSql,
        protectedColumn,
        setProtectedColumn,
        checks,
        setChecks,
        testError,
        setTestError,
        health,
        credentials,
        catalog,
        restrictions,
        updateRestrictions,
        login,
        config,
        account,
        test,
        signedIn,
        schemas,
        selectedSchemaSet,
        protectedSchemas,
        integrationSql,
        envBlock,
        maskingSql,
        ceilingSql,
        maskingConfirmed,
        ceilingConfirmed,
    };
};
