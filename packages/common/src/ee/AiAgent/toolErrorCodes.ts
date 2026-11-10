import { z } from 'zod';
import {
    QUERY_ERROR_CODES,
    type PythonExceptionType,
} from '../../types/queryErrorDetails';

/** Failures our own tool code detects before or around running a query. */
export const AI_TOOL_INPUT_ERROR_CODES = [
    'duplicate_node_id',
    'node_id_conflict',
    'unknown_node_reference',
    'unknown_terminal_node',
    'pipeline_cycle',
    'unread_node_cap',
    'too_many_queries',
    'python_nodes_disabled',
    'api_node_unsupported',
    'sql_disabled',
    'sql_not_select',
    'unknown_explore',
    'unknown_field',
    'invalid_parameters',
    'custom_metric_invalid',
    'period_comparison_invalid',
    'filter_expression_syntax',
    'filter_expression_mixed_connectors',
    'filter_expression_bounds_exceeded',
    'filter_expression_unknown_field',
    'filter_expression_wrong_category',
    'filter_expression_custom_metric_wrong_category',
    'filter_expression_invalid_value',
    'filter_expression_wrong_arity',
    'filter_expression_custom_metric_or',
    'filter_expression_search_field_values_or',
    'invalid_input',
    'not_found',
    'forbidden',
    'sql_rejected',
    'sql_approval_timeout',
    'composer_timeout',
    'query_cancelled',
] as const;

export const aiToolErrorCodeSchema = z.enum([
    ...QUERY_ERROR_CODES,
    ...AI_TOOL_INPUT_ERROR_CODES,
]);

export type AiToolErrorCode = z.infer<typeof aiToolErrorCodeSchema>;

export const parseAiToolErrorCode = (
    value: unknown,
): AiToolErrorCode | null => {
    const parsed = aiToolErrorCodeSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
};

export type AiToolErrorDetails = {
    code: AiToolErrorCode;
    pythonExceptionType: PythonExceptionType | null;
};
