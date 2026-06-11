import {
    CreateDuckdbCredentials,
    CreateDuckdbDucklakeCredentials,
    DuckdbConnectionType,
    DucklakeCatalogType,
    DucklakeDataPathType,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
import { Target } from '../types';

type DucklakeAttachOptions = {
    data_path?: string;
};

type DucklakeAttachEntry = {
    path: string;
    alias?: string;
    options?: DucklakeAttachOptions;
};

type DucklakeSecret = {
    name?: string;
    type?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    key_id?: string;
    secret?: string;
    region?: string;
    endpoint?: string;
    url_style?: string;
    use_ssl?: boolean;
    scope?: string;
    connection_string?: string;
    account_name?: string;
    account_key?: string;
    metadata_path?: string;
    data_path?: string;
    metadata_parameters?: { TYPE?: string; SECRET?: string } & Record<
        string,
        unknown
    >;
};

export type DuckdbTarget = {
    type: 'duckdb';
    path?: string;
    database?: string;
    schema: string;
    threads?: number;
    extensions?: string[];
    settings?: {
        motherduck_token?: string;
    } & Record<string, unknown>;
    attach?: DucklakeAttachEntry[];
    secrets?: DucklakeSecret[];
};

const fail = (target: Target, message: string): never => {
    throw new ParseError(
        `Couldn't read profiles.yml file for ${target.type}:\n${message}`,
    );
};

const validateDuckdbTarget = (target: Target): DuckdbTarget => {
    if (typeof target !== 'object' || target === null) {
        return fail(target, 'Target must be an object.');
    }
    const t = target as Record<string, unknown>;
    if (t.type !== 'duckdb') {
        return fail(target, "Expected target.type to be 'duckdb'.");
    }
    if (typeof t.schema !== 'string' || !t.schema) {
        return fail(target, 'Target is missing a `schema`.');
    }
    return target as DuckdbTarget;
};

const parseMotherDuck = (target: DuckdbTarget): CreateDuckdbCredentials => {
    const path = target.path ?? '';
    const motherduckPath = path.slice(3);
    const [database, queryString = ''] = motherduckPath.split('?', 2);
    const motherduckToken =
        target.settings?.motherduck_token ||
        new URLSearchParams(queryString).get('motherduck_token');

    if (!motherduckToken) {
        throw new ParseError(
            `Couldn't read profiles.yml file for ${target.type}:\nMotherDuck duckdb targets require settings.motherduck_token or a motherduck_token query parameter.`,
        );
    }

    return {
        type: WarehouseTypes.DUCKDB,
        connectionType: DuckdbConnectionType.MOTHERDUCK,
        database,
        schema: target.schema,
        token: motherduckToken,
        threads: target.threads,
    };
};

type DucklakeCatalog = CreateDuckdbDucklakeCredentials['catalog'];
type DucklakeDataPath = CreateDuckdbDucklakeCredentials['dataPath'];

const parseDucklakeCatalog = (
    attachPath: string,
    secrets: DucklakeSecret[],
): DucklakeCatalog => {
    // ducklake:<duckdb-path>            → DuckDB-backed catalog
    // ducklake:sqlite:<path>            → SQLite-backed catalog
    // ducklake:<secret-name>            → catalog defined by a postgres secret
    const rest = attachPath.slice('ducklake:'.length);

    if (rest.startsWith('sqlite:')) {
        return {
            type: DucklakeCatalogType.SQLITE,
            path: rest.slice('sqlite:'.length),
        };
    }

    const ducklakeSecret = secrets.find(
        (s) => s.type === 'ducklake' && s.name === rest,
    );
    if (ducklakeSecret) {
        const secretName = ducklakeSecret.metadata_parameters?.SECRET;
        const catalogSecret = secrets.find(
            (s) => s.type === 'postgres' && s.name === secretName,
        );
        if (
            !catalogSecret ||
            !catalogSecret.host ||
            !catalogSecret.database ||
            catalogSecret.port === undefined ||
            !catalogSecret.user ||
            !catalogSecret.password
        ) {
            throw new ParseError(
                'DuckLake catalog secret is missing required postgres fields (host, port, database, user, password).',
            );
        }
        return {
            type: DucklakeCatalogType.POSTGRES,
            host: catalogSecret.host,
            port: catalogSecret.port,
            database: catalogSecret.database,
            user: catalogSecret.user,
            password: catalogSecret.password,
        };
    }

    return {
        type: DucklakeCatalogType.DUCKDB,
        path: rest,
    };
};

const forcePathStyleFromUrlStyle = (
    style: string | undefined,
): boolean | undefined => {
    if (style === 'path') return true;
    if (style === 'vhost') return false;
    return undefined;
};

const parseDucklakeDataPath = (
    dataPath: string,
    secrets: DucklakeSecret[],
): DucklakeDataPath => {
    if (dataPath.startsWith('s3://')) {
        const s3 = secrets.find((s) => s.type === 's3');
        return {
            type: DucklakeDataPathType.S3,
            url: dataPath,
            endpoint: s3?.endpoint,
            region: s3?.region,
            accessKeyId: s3?.key_id,
            secretAccessKey: s3?.secret,
            forcePathStyle: forcePathStyleFromUrlStyle(s3?.url_style),
            useSsl: s3?.use_ssl,
        };
    }
    if (dataPath.startsWith('gs://') || dataPath.startsWith('gcs://')) {
        const gcs = secrets.find((s) => s.type === 'gcs');
        return {
            type: DucklakeDataPathType.GCS,
            url: dataPath,
            hmacKeyId: gcs?.key_id,
            hmacSecret: gcs?.secret,
        };
    }
    if (
        dataPath.startsWith('az://') ||
        dataPath.startsWith('azure://') ||
        dataPath.startsWith('abfss://')
    ) {
        const az = secrets.find((s) => s.type === 'azure');
        return {
            type: DucklakeDataPathType.AZURE,
            url: dataPath,
            connectionString: az?.connection_string,
            accountName: az?.account_name,
            accountKey: az?.account_key,
        };
    }
    return {
        type: DucklakeDataPathType.LOCAL,
        path: dataPath,
    };
};

const parseDucklake = (target: DuckdbTarget): CreateDuckdbCredentials => {
    const attachEntry = target.attach?.find((a) =>
        a.path.startsWith('ducklake:'),
    );
    if (!attachEntry) {
        throw new ParseError(
            'DuckLake duckdb target must declare an `attach` entry with a `ducklake:` path.',
        );
    }
    const secrets = target.secrets ?? [];
    const catalog = parseDucklakeCatalog(attachEntry.path, secrets);

    let dataPath: string | undefined = attachEntry.options?.data_path;
    if (!dataPath) {
        const ducklakeSecret = secrets.find((s) => s.type === 'ducklake');
        dataPath = ducklakeSecret?.data_path;
    }
    if (!dataPath) {
        throw new ParseError(
            'DuckLake duckdb target is missing a data_path (set it on the attach entry options or on the ducklake secret).',
        );
    }

    return {
        type: WarehouseTypes.DUCKDB,
        connectionType: DuckdbConnectionType.DUCKLAKE,
        schema: target.schema,
        catalogAlias: attachEntry.alias,
        threads: target.threads,
        catalog,
        dataPath: parseDucklakeDataPath(dataPath, secrets),
    };
};

export const convertDuckdbSchema = (
    target: Target,
): CreateDuckdbCredentials => {
    const t = validateDuckdbTarget(target);

    const hasDucklakeAttach = (t.attach ?? []).some((a) =>
        a.path.startsWith('ducklake:'),
    );

    if (hasDucklakeAttach) {
        return parseDucklake(t);
    }

    if (t.path?.startsWith('md:')) {
        return parseMotherDuck(t);
    }

    return fail(
        target,
        "Lightdash supports MotherDuck targets (path starting with 'md:') and DuckLake targets (attach entry with a 'ducklake:' path).",
    );
};
