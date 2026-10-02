import {
    getErrorMessage,
    getWarehouseDriverCode,
    isSshTunnelErrorData,
    WarehouseConnectionFailureCause,
    WarehouseTypes,
    type WarehouseConnectionFailure,
} from '@lightdash/common';
import { AWS_AUTH_ERROR_NAMES } from '../warehouseClients/AthenaWarehouseClient';
import { CLICKHOUSE_HOST_INCLUDES_SCHEME } from '../warehouseClients/ClickhouseWarehouseClient';
import { classifyMotherduckError } from '../warehouseClients/MotherduckErrorClassifier';
import { mapSnowflakeDiagnosticError } from '../warehouseClients/SnowflakeWarehouseClient';

type Signal = { code: string | null; message: string };

type CauseRule = {
    cause: WarehouseConnectionFailureCause;
    codes?: readonly string[];
    patterns?: readonly RegExp[];
};

const NODE_RULES: readonly CauseRule[] = [
    {
        cause: WarehouseConnectionFailureCause.INPUT_FORMAT,
        codes: ['ERR_SOCKET_BAD_PORT', 'ERR_INVALID_URL'],
    },
    {
        cause: WarehouseConnectionFailureCause.TLS,
        codes: [
            'SELF_SIGNED_CERT_IN_CHAIN',
            'DEPTH_ZERO_SELF_SIGNED_CERT',
            'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
            'UNABLE_TO_GET_ISSUER_CERT',
            'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
            'CERT_HAS_EXPIRED',
            'CERT_NOT_YET_VALID',
            'ERR_TLS_CERT_ALTNAME_INVALID',
            'ERR_SSL_WRONG_VERSION_NUMBER',
            'EPROTO',
        ],
        patterns: [
            /does not support ssl/i,
            /self[- ]signed certificate/i,
            /certificate has expired/i,
            /ssl (?:connection|handshake|routines)/i,
            /before secure tls connection was established/i,
        ],
    },
    {
        cause: WarehouseConnectionFailureCause.TIMEOUT,
        codes: ['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNABORTED'],
        patterns: [
            /timeout exceeded when trying to connect/i,
            /connection terminated due to connection timeout/i,
            /timed out/i,
        ],
    },
    {
        cause: WarehouseConnectionFailureCause.NETWORK,
        codes: [
            'ECONNREFUSED',
            'ECONNRESET',
            'EHOSTUNREACH',
            'ENETUNREACH',
            'ENOTFOUND',
            'EAI_AGAIN',
            'EPIPE',
        ],
        patterns: [
            /econnrefused|enotfound|ehostunreach|enetunreach|eai_again/i,
            /getaddrinfo/i,
            /no pg_hba\.conf entry/i,
            /ip address .* is not allowed/i,
        ],
    },
];

const matches = (rule: CauseRule, { code, message }: Signal) =>
    (code !== null && (rule.codes ?? []).includes(code)) ||
    (rule.patterns ?? []).some((pattern) => pattern.test(message));

const classifyByRules = (
    signal: Signal,
    rules: readonly CauseRule[],
): WarehouseConnectionFailureCause | null =>
    rules.find((rule) => matches(rule, signal))?.cause ?? null;

const toSignal = (error: unknown): Signal => ({
    code: getWarehouseDriverCode(error),
    message: getErrorMessage(error),
});

const failure = (
    signal: Signal,
    cause: WarehouseConnectionFailureCause | null,
): WarehouseConnectionFailure => ({
    cause: cause ?? WarehouseConnectionFailureCause.OTHER,
    driverCode: signal.code,
});

const classifyWithRules =
    (warehouseRules: readonly CauseRule[]) =>
    (error: unknown): WarehouseConnectionFailure => {
        const signal = toSignal(error);
        return failure(
            signal,
            classifyByRules(signal, warehouseRules) ??
                classifyByRules(signal, NODE_RULES),
        );
    };

const POSTGRES_RULES: readonly CauseRule[] = [
    {
        cause: WarehouseConnectionFailureCause.TLS,
        patterns: [/no pg_hba\.conf entry .*no encryption/i],
    },
    {
        cause: WarehouseConnectionFailureCause.NETWORK,
        patterns: [/no pg_hba\.conf entry for host/i],
    },
    {
        cause: WarehouseConnectionFailureCause.CREDENTIALS,
        codes: ['28P01', '28000'],
        patterns: [/password authentication failed/i],
    },
    {
        cause: WarehouseConnectionFailureCause.MISSING_GRANT_OR_OBJECT,
        codes: ['3D000', '3F000', '42501', '42P01'],
        patterns: [/permission denied/i, /does not exist/i],
    },
];

const CLICKHOUSE_RULES: readonly CauseRule[] = [
    {
        cause: WarehouseConnectionFailureCause.INPUT_FORMAT,
        codes: [CLICKHOUSE_HOST_INCLUDES_SCHEME],
    },
    {
        cause: WarehouseConnectionFailureCause.NETWORK,
        codes: ['195'],
    },
    {
        cause: WarehouseConnectionFailureCause.CREDENTIALS,
        codes: ['516', '192', '194'],
        patterns: [/authentication failed/i, /wrong password/i],
    },
    {
        cause: WarehouseConnectionFailureCause.MISSING_GRANT_OR_OBJECT,
        codes: ['81', '60', '497'],
        patterns: [/not enough privileges/i, /unknown database/i],
    },
    {
        cause: WarehouseConnectionFailureCause.TIMEOUT,
        codes: ['159', '209'],
    },
];

const BIGQUERY_RULES: readonly CauseRule[] = [
    {
        cause: WarehouseConnectionFailureCause.CREDENTIALS,
        codes: ['invalid_grant', 'authError', 'unauthorized'],
    },
    {
        cause: WarehouseConnectionFailureCause.MISSING_GRANT_OR_OBJECT,
        codes: ['accessDenied', 'notFound', 'billingNotEnabled'],
    },
    {
        cause: WarehouseConnectionFailureCause.INPUT_FORMAT,
        codes: ['invalid'],
    },
    {
        cause: WarehouseConnectionFailureCause.CREDENTIALS,
        patterns: [/could not load the default credentials/i, /invalid_grant/i],
    },
];

const ATHENA_RULES: readonly CauseRule[] = [
    {
        cause: WarehouseConnectionFailureCause.CREDENTIALS,
        codes: [...AWS_AUTH_ERROR_NAMES, 'http_401'],
    },
    {
        cause: WarehouseConnectionFailureCause.MISSING_GRANT_OR_OBJECT,
        codes: [
            'AccessDeniedException',
            'AccessDenied',
            'ResourceNotFoundException',
            'MetadataException',
            'http_403',
        ],
    },
    {
        cause: WarehouseConnectionFailureCause.INPUT_FORMAT,
        codes: ['InvalidRequestException', 'ValidationException'],
    },
];

const DATABRICKS_RULES: readonly CauseRule[] = [
    {
        cause: WarehouseConnectionFailureCause.CREDENTIALS,
        patterns: [
            /\b401\b/,
            /invalid access token/i,
            /unauthorized/i,
            /invalid client/i,
        ],
    },
    {
        cause: WarehouseConnectionFailureCause.MISSING_GRANT_OR_OBJECT,
        patterns: [
            /\b403\b/,
            /permission_denied/i,
            /\[(?:SCHEMA|CATALOG|TABLE_OR_VIEW)_NOT_FOUND\]/,
            /\[INSUFFICIENT_PERMISSIONS\]/,
        ],
    },
    {
        cause: WarehouseConnectionFailureCause.INPUT_FORMAT,
        patterns: [/\b404\b/],
    },
];

const TRINO_RULES: readonly CauseRule[] = [
    {
        cause: WarehouseConnectionFailureCause.CREDENTIALS,
        patterns: [/\b401\b/, /unauthorized/i, /invalid credentials/i],
    },
    {
        cause: WarehouseConnectionFailureCause.MISSING_GRANT_OR_OBJECT,
        patterns: [/access denied/i, /does not exist/i, /\b403\b/],
    },
];

const SNOWFLAKE_CATEGORY_CAUSES: Record<
    ReturnType<typeof mapSnowflakeDiagnosticError>['category'],
    WarehouseConnectionFailureCause | null
> = {
    account_identifier: WarehouseConnectionFailureCause.INPUT_FORMAT,
    private_key: WarehouseConnectionFailureCause.CREDENTIALS,
    authentication: WarehouseConnectionFailureCause.CREDENTIALS,
    network_policy: WarehouseConnectionFailureCause.NETWORK,
    warehouse_access: WarehouseConnectionFailureCause.MISSING_GRANT_OR_OBJECT,
    database_access: WarehouseConnectionFailureCause.MISSING_GRANT_OR_OBJECT,
    unknown: null,
};

const classifySnowflake = (error: unknown): WarehouseConnectionFailure => {
    const signal = toSignal(error);
    const { category } = mapSnowflakeDiagnosticError({
        code: signal.code ?? undefined,
        message: signal.message,
    });
    return failure(
        signal,
        SNOWFLAKE_CATEGORY_CAUSES[category] ??
            classifyByRules(signal, NODE_RULES),
    );
};

const DUCKDB_RULES: readonly CauseRule[] = [
    {
        cause: WarehouseConnectionFailureCause.INPUT_FORMAT,
        patterns: [/^invalid input error/i, /no such file or directory/i],
    },
    {
        cause: WarehouseConnectionFailureCause.MISSING_GRANT_OR_OBJECT,
        patterns: [/^catalog error/i],
    },
];

const classifyDuckdb = (error: unknown): WarehouseConnectionFailure => {
    const signal = toSignal(error);
    if (classifyMotherduckError(error) === 'auth') {
        return failure(signal, WarehouseConnectionFailureCause.CREDENTIALS);
    }
    return failure(
        signal,
        classifyByRules(signal, DUCKDB_RULES) ??
            classifyByRules(signal, NODE_RULES),
    );
};

export const WAREHOUSE_CONNECTION_FAILURE_CLASSIFIERS: Record<
    WarehouseTypes,
    (error: unknown) => WarehouseConnectionFailure
> = {
    [WarehouseTypes.POSTGRES]: classifyWithRules(POSTGRES_RULES),
    [WarehouseTypes.REDSHIFT]: classifyWithRules(POSTGRES_RULES),
    [WarehouseTypes.CLICKHOUSE]: classifyWithRules(CLICKHOUSE_RULES),
    [WarehouseTypes.BIGQUERY]: classifyWithRules(BIGQUERY_RULES),
    [WarehouseTypes.ATHENA]: classifyWithRules(ATHENA_RULES),
    [WarehouseTypes.DATABRICKS]: classifyWithRules(DATABRICKS_RULES),
    [WarehouseTypes.TRINO]: classifyWithRules(TRINO_RULES),
    [WarehouseTypes.SNOWFLAKE]: classifySnowflake,
    [WarehouseTypes.DUCKDB]: classifyDuckdb,
};

export const classifyWarehouseConnectionFailure = (
    warehouseType: WarehouseTypes,
    error: unknown,
): WarehouseConnectionFailure => {
    if (
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        isSshTunnelErrorData(error.data)
    ) {
        return {
            cause: WarehouseConnectionFailureCause.NETWORK,
            driverCode: `ssh_${error.data.stage}`,
        };
    }
    return WAREHOUSE_CONNECTION_FAILURE_CLASSIFIERS[warehouseType](error);
};
