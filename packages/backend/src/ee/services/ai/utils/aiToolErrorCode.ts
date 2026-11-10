import {
    AiAgentValidatorError,
    ForbiddenError,
    LightdashError,
    NotFoundError,
    ParameterError,
    parseAiToolErrorCode,
    toPythonExceptionType,
    type AiToolErrorCode,
    type AiToolErrorDetails,
} from '@lightdash/common';
import { InvalidToolInputError, NoSuchToolError } from 'ai';
import { getQueryErrorDetails } from '../../../../services/AsyncQueryService/queryErrorDetails';
import { AiAgentUnknownFieldsError } from './AiAgentUnknownFieldsError';
import type { FilterExpressionResolutionError } from './filterExpressions/errors';

/** The code an agent tool error carries: set at the throw site, else derived from its class. */
export const getAiToolErrorDetails = (error: unknown): AiToolErrorDetails => {
    if (error instanceof LightdashError) {
        const code = parseAiToolErrorCode(error.data.errorCode);
        if (code !== null)
            return {
                code,
                pythonExceptionType:
                    error.data.pythonExceptionType == null
                        ? null
                        : toPythonExceptionType(error.data.pythonExceptionType),
            };
    }
    if (error instanceof AiAgentUnknownFieldsError)
        return { code: 'unknown_field', pythonExceptionType: null };
    const queryDetails = getQueryErrorDetails(error);
    if (queryDetails.code !== 'unknown') return queryDetails;
    const code = ((): AiToolErrorCode => {
        if (
            error instanceof AiAgentValidatorError ||
            error instanceof ParameterError ||
            InvalidToolInputError.isInstance(error) ||
            NoSuchToolError.isInstance(error)
        )
            return 'invalid_input';
        if (error instanceof NotFoundError) return 'not_found';
        if (error instanceof ForbiddenError) return 'forbidden';
        return 'unknown';
    })();
    return { code, pythonExceptionType: null };
};

export const getFilterExpressionErrorCode = (
    code: FilterExpressionResolutionError['code'],
): AiToolErrorCode =>
    parseAiToolErrorCode(code.toLowerCase()) ?? 'invalid_input';
