import {
    AuthorizationError,
    BigqueryTokenError,
    CompileError,
    DatabricksTokenError,
    DbtError,
    ForbiddenError,
    InsufficientGitPermissionsError,
    LightdashProjectConfigError,
    NotFoundError,
    OauthAuthenticationError,
    ParseError,
    PreviewWarehouseSignInExpiredError,
    RedshiftIamTokenError,
    SnowflakeTokenError,
    SshTunnelError,
    TimeoutError,
    UnexpectedGitError,
    WarehouseQueryTimeoutError,
} from '@lightdash/common';
import {
    type ConnectionTestErrorCategory,
    type ConnectionTestStage,
} from '../../analytics/LightdashAnalytics';

// Node network codes, Postgres/Redshift SQLSTATEs and Snowflake error codes
const CATEGORY_BY_ERROR_CODE = new Map<string, ConnectionTestErrorCategory>([
    ['ENOTFOUND', 'network'],
    ['EAI_AGAIN', 'network'],
    ['ECONNREFUSED', 'network'],
    ['ECONNRESET', 'network'],
    ['EHOSTUNREACH', 'network'],
    ['ENETUNREACH', 'network'],
    ['ETIMEDOUT', 'timeout'],
    ['ESOCKETTIMEDOUT', 'timeout'],
    ['28P01', 'authentication'],
    ['28000', 'authentication'],
    ['42501', 'permission'],
    ['3D000', 'not_found'],
    ['3F000', 'not_found'],
    ['390100', 'authentication'],
    ['390144', 'authentication'],
    ['390422', 'network'],
]);

const getErrorCode = (error: unknown, depth = 0): string | null => {
    if (!(error instanceof Error) || depth > 2) return null;
    if (
        'code' in error &&
        (typeof error.code === 'string' || typeof error.code === 'number')
    ) {
        return String(error.code);
    }
    return getErrorCode(error.cause, depth + 1);
};

const classifyWarehouseError = (
    error: unknown,
): ConnectionTestErrorCategory => {
    if (
        error instanceof TimeoutError ||
        error instanceof WarehouseQueryTimeoutError
    ) {
        return 'timeout';
    }
    if (
        error instanceof AuthorizationError ||
        error instanceof OauthAuthenticationError ||
        error instanceof SnowflakeTokenError ||
        error instanceof BigqueryTokenError ||
        error instanceof DatabricksTokenError ||
        error instanceof RedshiftIamTokenError ||
        error instanceof PreviewWarehouseSignInExpiredError
    ) {
        return 'authentication';
    }
    if (error instanceof ForbiddenError) return 'permission';
    if (error instanceof NotFoundError) return 'not_found';
    if (error instanceof SshTunnelError) return 'network';
    const code = getErrorCode(error);
    return (code !== null && CATEGORY_BY_ERROR_CODE.get(code)) || 'unknown';
};

export const classifyConnectionTestError = (
    error: unknown,
): {
    stage: ConnectionTestStage;
    errorCategory: ConnectionTestErrorCategory;
} => {
    if (error instanceof InsufficientGitPermissionsError) {
        return { stage: 'dbt', errorCategory: 'permission' };
    }
    if (
        error instanceof DbtError ||
        error instanceof ParseError ||
        error instanceof CompileError ||
        error instanceof UnexpectedGitError ||
        error instanceof LightdashProjectConfigError
    ) {
        return { stage: 'dbt', errorCategory: 'dbt' };
    }
    return { stage: 'warehouse', errorCategory: classifyWarehouseError(error) };
};
