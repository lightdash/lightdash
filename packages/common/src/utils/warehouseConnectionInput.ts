import {
    DuckdbConnectionType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '../types/projects';
import assertUnreachable from './assertUnreachable';

export enum ConnectionInputParseKind {
    UNCHANGED = 'unchanged',
    NORMALISED = 'normalised',
    NEEDS_CONFIRMATION = 'needs_confirmation',
    BLOCKED = 'blocked',
}

export type ConnectionInputParseResult =
    | { kind: ConnectionInputParseKind.UNCHANGED; value: string }
    | {
          kind: ConnectionInputParseKind.NORMALISED;
          value: string;
          original: string;
          changes: string[];
      }
    | {
          kind: ConnectionInputParseKind.NEEDS_CONFIRMATION;
          value: string;
          original: string;
          proposed: string;
          proposedPort: number | null;
          scheme: string | null;
          changes: string[];
      }
    | {
          kind: ConnectionInputParseKind.BLOCKED;
          value: string;
          original: string;
          reason: string;
      };

export type ConnectionInputEnvironment = {
    allowLocalHosts: boolean;
};

type HostParseOptions = ConnectionInputEnvironment & {
    schemeAffectsTransport: boolean;
    fieldLabel: string;
};

const SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):\/\//i;
const BRACKETED_IPV6_PATTERN = /^\[([0-9a-f:.]+)\](?::(\d{1,5}))?$/i;
const HOST_WITH_PORT_PATTERN = /^([^:]+):(\d{1,5})$/;
const LOCAL_HOSTS = new Set(['localhost', '0.0.0.0', '::1', '::']);
const SNOWFLAKE_SUFFIX_PATTERN = /\.snowflakecomputing\.com$/i;

const isLocalHost = (host: string) => {
    const lower = host.toLowerCase();
    return (
        LOCAL_HOSTS.has(lower) ||
        lower.startsWith('127.') ||
        lower.endsWith('.localhost')
    );
};

const toPort = (raw: string | undefined): number | null => {
    if (raw === undefined) return null;
    const port = Number(raw);
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
};

const splitHostAndPort = (
    hostWithPort: string,
): { host: string; port: number | null } => {
    const bracketed = hostWithPort.match(BRACKETED_IPV6_PATTERN);
    if (bracketed) {
        return { host: bracketed[1], port: toPort(bracketed[2]) };
    }
    const withPort = hostWithPort.match(HOST_WITH_PORT_PATTERN);
    if (withPort) {
        return { host: withPort[1], port: toPort(withPort[2]) };
    }
    return { host: hostWithPort, port: null };
};

const finish = (
    original: string,
    value: string,
    changes: string[],
): ConnectionInputParseResult =>
    changes.length === 0
        ? { kind: ConnectionInputParseKind.UNCHANGED, value: original }
        : {
              kind: ConnectionInputParseKind.NORMALISED,
              value,
              original,
              changes,
          };

export const parseHostInput = (
    input: string,
    options: HostParseOptions,
): ConnectionInputParseResult => {
    if (typeof input !== 'string') {
        return { kind: ConnectionInputParseKind.UNCHANGED, value: input };
    }
    const automaticChanges: string[] = [];
    const confirmChanges: string[] = [];
    let rest = input.trim();
    if (rest !== input) {
        automaticChanges.push(
            `We removed spaces around the ${options.fieldLabel}`,
        );
    }
    if (rest === '') {
        return finish(input, rest, automaticChanges);
    }

    const schemeMatch = rest.match(SCHEME_PATTERN);
    const scheme = schemeMatch ? schemeMatch[1].toLowerCase() : null;
    if (schemeMatch) {
        rest = rest.slice(schemeMatch[0].length);
        const change = `Remove ${schemeMatch[0]} from the ${options.fieldLabel}`;
        if (options.schemeAffectsTransport) {
            confirmChanges.push(change);
        } else {
            automaticChanges.push(`We removed ${schemeMatch[0]}`);
        }
    }

    const atIndex = rest.lastIndexOf('@', rest.search(/[/?#]|$/));
    if (atIndex >= 0) {
        rest = rest.slice(atIndex + 1);
        confirmChanges.push(
            `Remove the user name before @ from the ${options.fieldLabel}`,
        );
    }

    const pathIndex = rest.search(/[/?#]/);
    if (pathIndex >= 0) {
        const path = rest.slice(pathIndex);
        rest = rest.slice(0, pathIndex);
        if (path !== '/') {
            confirmChanges.push(
                `Remove ${path} from the ${options.fieldLabel}`,
            );
        } else {
            automaticChanges.push('We removed the trailing /');
        }
    }

    const { host, port } = splitHostAndPort(rest);
    if (port !== null) {
        confirmChanges.push(`Move port ${port} to the port field`);
    } else if (host !== rest) {
        confirmChanges.push(`Remove the brackets around ${host}`);
    }

    if (!options.allowLocalHosts && isLocalHost(host)) {
        return {
            kind: ConnectionInputParseKind.BLOCKED,
            value: input,
            original: input,
            reason: `Lightdash can't reach ${host} from here. Use a host that is reachable from the internet, or connect through an SSH tunnel.`,
        };
    }

    if (confirmChanges.length > 0) {
        return {
            kind: ConnectionInputParseKind.NEEDS_CONFIRMATION,
            value: input,
            original: input,
            proposed: host,
            proposedPort: port,
            scheme,
            changes: [...automaticChanges, ...confirmChanges],
        };
    }
    return finish(input, host, automaticChanges);
};

export const parseSnowflakeAccountInput = (
    input: string,
): ConnectionInputParseResult => {
    if (typeof input !== 'string') {
        return { kind: ConnectionInputParseKind.UNCHANGED, value: input };
    }
    const changes: string[] = [];
    let value = input.trim();
    if (value !== input) changes.push('We removed spaces around the account');
    const schemeMatch = value.match(SCHEME_PATTERN);
    if (schemeMatch) {
        value = value.slice(schemeMatch[0].length);
        changes.push(`We removed ${schemeMatch[0]}`);
    }
    const pathIndex = value.search(/[/?#]/);
    if (pathIndex >= 0) {
        value = value.slice(0, pathIndex);
        changes.push('We removed the path after the account');
    }
    if (SNOWFLAKE_SUFFIX_PATTERN.test(value)) {
        value = value.replace(SNOWFLAKE_SUFFIX_PATTERN, '');
        changes.push('We removed .snowflakecomputing.com');
    }
    return finish(input, value, changes);
};

export const parseTrimmedInput = (
    input: string,
    fieldLabel: string,
): ConnectionInputParseResult => {
    if (typeof input !== 'string') {
        return { kind: ConnectionInputParseKind.UNCHANGED, value: input };
    }
    const value = input.trim();
    return finish(
        input,
        value,
        value === input ? [] : [`We removed spaces around the ${fieldLabel}`],
    );
};

const LOCAL_PATH_PATTERN = /^(\/|\.{1,2}\/|~\/|[a-z]:\\)|\.(duck)?db$/i;

export const parseMotherduckDatabaseInput = (
    input: string,
): ConnectionInputParseResult => {
    if (typeof input !== 'string') {
        return { kind: ConnectionInputParseKind.UNCHANGED, value: input };
    }
    const trimmed = parseTrimmedInput(input, 'database');
    const value =
        trimmed.kind === ConnectionInputParseKind.NORMALISED
            ? trimmed.value
            : input;
    if (LOCAL_PATH_PATTERN.test(value) && !value.startsWith('md:')) {
        return {
            kind: ConnectionInputParseKind.BLOCKED,
            value: input,
            original: input,
            reason: 'This looks like a file on your computer. Enter the name of a MotherDuck database instead.',
        };
    }
    return trimmed;
};

export type WarehouseConnectionInputIssue = {
    field: string;
    result: Exclude<
        ConnectionInputParseResult,
        { kind: ConnectionInputParseKind.UNCHANGED }
    >;
};

const hostOptions = (
    environment: ConnectionInputEnvironment,
    useSshTunnel: boolean | undefined,
    schemeAffectsTransport: boolean,
    fieldLabel = 'host',
): HostParseOptions => ({
    allowLocalHosts: environment.allowLocalHosts || useSshTunnel === true,
    schemeAffectsTransport,
    fieldLabel,
});

export const parseWarehouseConnectionInputs = (
    credentials: CreateWarehouseCredentials,
    environment: ConnectionInputEnvironment,
): Record<string, ConnectionInputParseResult> => {
    switch (credentials.type) {
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.REDSHIFT:
            return {
                host: parseHostInput(
                    credentials.host,
                    hostOptions(environment, credentials.useSshTunnel, true),
                ),
            };
        case WarehouseTypes.TRINO:
            return {
                host: parseHostInput(
                    credentials.host,
                    hostOptions(environment, false, true),
                ),
            };
        case WarehouseTypes.CLICKHOUSE:
            return {
                host: parseHostInput(
                    credentials.host,
                    hostOptions(environment, false, true),
                ),
            };
        case WarehouseTypes.DATABRICKS:
            return {
                serverHostName: parseHostInput(
                    credentials.serverHostName,
                    hostOptions(environment, false, false, 'server host name'),
                ),
            };
        case WarehouseTypes.SNOWFLAKE:
            return { account: parseSnowflakeAccountInput(credentials.account) };
        case WarehouseTypes.BIGQUERY:
            return {
                project: parseTrimmedInput(credentials.project, 'project'),
            };
        case WarehouseTypes.DUCKDB:
            return credentials.connectionType ===
                DuckdbConnectionType.MOTHERDUCK
                ? {
                      database: parseMotherduckDatabaseInput(
                          credentials.database,
                      ),
                  }
                : {};
        case WarehouseTypes.ATHENA:
            return {};
        default:
            return assertUnreachable(
                credentials,
                'Unknown warehouse type in connection input parsing',
            );
    }
};

export const getWarehouseConnectionInputIssues = (
    credentials: CreateWarehouseCredentials,
    environment: ConnectionInputEnvironment,
): WarehouseConnectionInputIssue[] =>
    Object.entries(
        parseWarehouseConnectionInputs(credentials, environment),
    ).flatMap(([field, result]) =>
        result.kind === ConnectionInputParseKind.UNCHANGED
            ? []
            : [{ field, result }],
    );

export const applyAutomaticConnectionInputFixes = <
    T extends CreateWarehouseCredentials,
>(
    credentials: T,
    issues: WarehouseConnectionInputIssue[],
): T =>
    issues.reduce<T>(
        (fixed, { field, result }) =>
            result.kind === ConnectionInputParseKind.NORMALISED
                ? { ...fixed, [field]: result.value }
                : fixed,
        credentials,
    );
