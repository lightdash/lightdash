import {
    FeatureFlags,
    type ApiError,
    type SnowflakeAiBoundaryCheck,
    type SnowflakeAiBoundaryGuideConfig,
    type SnowflakeAiBoundaryGuideUpdate,
    type SnowflakeAiBoundaryTestBody,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { lightdashApi } from '../../api';
import { useTables } from '../../features/sqlRunner/hooks/useTables';
import {
    useAiAccessRestrictions,
    useProjectUpdateAiAccessRestrictions,
} from '../../hooks/useProject';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
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
    const procedureFlag = useServerFeatureFlag(FeatureFlags.AiQueryProcedure);
    const aiQueryProcedureEnabled = procedureFlag.data?.enabled === true;
    const queryClient = useQueryClient();
    const queryKey = ['snowflake-ai-boundary-guide', projectUuid];
    const config = useQuery<SnowflakeAiBoundaryGuideConfig, ApiError>({
        queryKey,
        queryFn: () =>
            lightdashApi<SnowflakeAiBoundaryGuideConfig>({
                version: 'v2',
                url: `/projects/${projectUuid}/ai-boundary/guide`,
                method: 'GET',
                body: undefined,
            }),
        enabled: isSnowflake,
    });
    const mark = useMutation<
        SnowflakeAiBoundaryGuideConfig,
        ApiError,
        SnowflakeAiBoundaryGuideUpdate
    >({
        mutationFn: (body) =>
            lightdashApi<SnowflakeAiBoundaryGuideConfig>({
                version: 'v2',
                url: `/projects/${projectUuid}/ai-boundary/guide`,
                method: 'PATCH',
                body: JSON.stringify(body),
            }),
        onSuccess: (result) => queryClient.setQueryData(queryKey, result),
    });
    const test = useMutation<
        SnowflakeAiBoundaryCheck[],
        ApiError,
        SnowflakeAiBoundaryTestBody
    >({
        mutationFn: (body) =>
            lightdashApi<SnowflakeAiBoundaryCheck[]>({
                version: 'v2',
                url: `/projects/${projectUuid}/ai-boundary/test`,
                method: 'POST',
                body: JSON.stringify(body),
            }),
        onSettled: () => queryClient.invalidateQueries(queryKey),
    });
    const catalogQuery = useTables({ projectUuid });
    const { data: restrictions } = useAiAccessRestrictions(
        projectUuid,
        showAiAccessRestrictions,
    );
    const updateRestrictions =
        useProjectUpdateAiAccessRestrictions(projectUuid);
    const [inputs, setInputs] = useState({
        integrationName: '',
        roles: '',
        procedureDatabase: '',
        procedureSchema: '',
        procedureName: 'LIGHTDASH_AI_RUN_SQL',
        procedureOwnerRole: '',
        allowedSchemas: [] as string[],
        tagDatabase: '',
        tagSchema: '',
        selectedSchemas: [] as string[],
        protectedColumn: null as SnowflakeAiBoundaryTestBody['protectedColumn'],
    });
    const schemas = useMemo(
        () =>
            Object.entries(catalogQuery.data ?? {}).flatMap(
                ([database, items]) =>
                    Object.keys(items).map((schema) => ({
                        database,
                        schema,
                        key: JSON.stringify([database, schema]),
                        label: `${database}.${schema}`,
                    })),
            ),
        [catalogQuery.data],
    );
    const selectedSchemaSet = new Set(inputs.selectedSchemas);
    const allowedSchemaSet = new Set(inputs.allowedSchemas);
    const protectedSchemas = schemas.filter((schema) =>
        selectedSchemaSet.has(schema.key),
    );
    const sql = useGuideSql({
        ...inputs,
        redirectUri: config.data?.redirectUri ?? '',
        account: config.data?.snowflakeAccount ?? '',
        protectedSchemas,
        aiQueryProcedureEnabled,
        allowedSchemas: schemas.filter((schema) =>
            allowedSchemaSet.has(schema.key),
        ),
    });
    return {
        config,
        aiQueryProcedureEnabled,
        mark,
        test,
        catalogQuery,
        restrictions,
        updateRestrictions,
        inputs,
        setInputs,
        schemas,
        ...sql,
    };
};

export type BoundaryGuide = ReturnType<typeof useBoundaryGuide>;
