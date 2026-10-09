import {
    type ApiError,
    type ApiFormulaValidationResults,
    type MetricQuery,
} from '@lightdash/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type LightdashApi } from '../../../api';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import { selectTableName, useExplorerSelector } from '../../explorer/store';

const validateFormula = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    exploreName: string,
    formula: string,
    metricQuery: MetricQuery,
) =>
    lightdashApi<ApiFormulaValidationResults>({
        url: `/projects/${projectUuid}/explores/${exploreName}/validateFormula`,
        method: 'POST',
        body: JSON.stringify({ formula, metricQuery }),
    });

const withFormulaPrefix = (formula: string) =>
    formula.startsWith('=') ? formula : `=${formula}`;

export const useFormulaValidation = (
    formula: string,
    metricQuery: MetricQuery,
) => {
    const lightdashApi = useLightdashApi();
    const [validatedFormula, setValidatedFormula] = useState<string | null>(
        null,
    );

    useEffect(() => {
        setValidatedFormula(null);
    }, [formula]);

    const validate = useCallback(() => {
        const trimmed = formula.trim();
        setValidatedFormula(trimmed.length > 0 ? trimmed : null);
    }, [formula]);

    const projectUuid = useProjectUuid();
    const tableName = useExplorerSelector(selectTableName);

    const formulaWithPrefix = useMemo(
        () => (validatedFormula ? withFormulaPrefix(validatedFormula) : null),
        [validatedFormula],
    );

    const { data } = useQuery<ApiFormulaValidationResults, ApiError>({
        queryKey: [
            'formulaValidation',
            projectUuid,
            tableName,
            formulaWithPrefix,
            metricQuery,
        ],
        queryFn: () =>
            validateFormula(
                lightdashApi,
                projectUuid!,
                tableName!,
                formulaWithPrefix!,
                metricQuery,
            ),
        enabled: !!projectUuid && !!tableName && !!formulaWithPrefix,
        retry: false,
    });

    const error = validatedFormula && data && !data.valid ? data.error : null;

    const queryClient = useQueryClient();

    const validateNow = useCallback(async (): Promise<string | null> => {
        const trimmed = formula.trim();
        setValidatedFormula(trimmed.length > 0 ? trimmed : null);
        if (!trimmed || !projectUuid || !tableName) return null;
        const prefixed = withFormulaPrefix(trimmed);
        try {
            const result = await queryClient.fetchQuery<
                ApiFormulaValidationResults,
                ApiError
            >({
                queryKey: [
                    'formulaValidation',
                    projectUuid,
                    tableName,
                    prefixed,
                    metricQuery,
                ],
                queryFn: () =>
                    validateFormula(
                        lightdashApi,
                        projectUuid,
                        tableName,
                        prefixed,
                        metricQuery,
                    ),
                retry: false,
            });
            return result.valid ? null : result.error;
        } catch {
            // The parser is unreachable. Blocking the save on an infrastructure
            // failure would be worse than letting it through.
            return null;
        }
    }, [
        formula,
        metricQuery,
        projectUuid,
        queryClient,
        tableName,
        lightdashApi,
    ]);

    return {
        error,
        validate,
        validateNow,
    };
};
