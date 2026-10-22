import {
    getWarehouseSignInErrorType,
    isBigqueryTokenErrorMessage,
    isPreviewWarehouseSignInExpiredMessage,
    type ApiError,
} from '@lightdash/common';

const isRedshiftIamTokenErrorMessage = (message: string): boolean => {
    const normalizedMessage = message.toLowerCase();
    return (
        normalizedMessage.includes('redshift iam') &&
        normalizedMessage.includes('expired')
    );
};

const getAsyncQueryErrorType = (
    message: string,
): Pick<ApiError['error'], 'name' | 'statusCode'> => {
    const signIn = getWarehouseSignInErrorType(message);
    if (signIn) return { name: signIn.name, statusCode: 401 };
    if (isRedshiftIamTokenErrorMessage(message)) {
        return { name: 'RedshiftIamTokenError', statusCode: 401 };
    }
    if (isPreviewWarehouseSignInExpiredMessage(message)) {
        return { name: 'PreviewWarehouseSignInExpiredError', statusCode: 401 };
    }
    if (isBigqueryTokenErrorMessage(message)) {
        return { name: 'BigqueryTokenError', statusCode: 401 };
    }
    return { name: 'Error', statusCode: 500 };
};

export const getAsyncQueryError = (message: string | null): ApiError => {
    const errorMessage = message || 'Query failed';
    const { name, statusCode } = getAsyncQueryErrorType(errorMessage);

    return {
        status: 'error',
        error: {
            name,
            statusCode,
            message: errorMessage,
            data: {},
        },
    };
};

export const getSqlQueryError = (message: string | null): ApiError | Error => {
    const error = getAsyncQueryError(message);
    return getWarehouseSignInErrorType(message ?? '') !== null
        ? error
        : new Error(message || 'Error executing SQL query');
};
