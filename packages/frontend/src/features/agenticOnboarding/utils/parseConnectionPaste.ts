export type ParsedConnectionFormat =
    | 'connection_string'
    | 'profiles_yml'
    | 'key_values';

export type ParsedConnectionField =
    | 'account'
    | 'user'
    | 'password'
    | 'role'
    | 'database'
    | 'warehouse'
    | 'schema';

export type ParsedConnection = {
    format: ParsedConnectionFormat;
    values: Partial<Record<ParsedConnectionField, string>>;
    secretFields: ParsedConnectionField[];
};

const SECRET_FIELDS: ParsedConnectionField[] = ['password'];

const FIELD_ALIASES: Record<string, ParsedConnectionField> = {
    account: 'account',
    accountname: 'account',
    user: 'user',
    username: 'user',
    uid: 'user',
    password: 'password',
    pwd: 'password',
    pass: 'password',
    role: 'role',
    database: 'database',
    db: 'database',
    dbname: 'database',
    warehouse: 'warehouse',
    wh: 'warehouse',
    schema: 'schema',
};

const KNOWN_FIELDS: ParsedConnectionField[] = [
    'account',
    'user',
    'password',
    'role',
    'database',
    'warehouse',
    'schema',
];

const stripQuotes = (value: string): string =>
    value.trim().replace(/^['"]|['"]$/g, '');

const secretsPresent = (
    values: Partial<Record<ParsedConnectionField, string>>,
): ParsedConnectionField[] =>
    SECRET_FIELDS.filter((field) => values[field] !== undefined);

const finalise = (
    format: ParsedConnectionFormat,
    values: Partial<Record<ParsedConnectionField, string>>,
): ParsedConnection | null => {
    const cleaned: Partial<Record<ParsedConnectionField, string>> = {};
    for (const field of KNOWN_FIELDS) {
        const raw = values[field];
        if (raw !== undefined && raw.trim() !== '') {
            cleaned[field] = raw.trim();
        }
    }
    if (Object.keys(cleaned).length === 0) {
        return null;
    }
    return { format, values: cleaned, secretFields: secretsPresent(cleaned) };
};

const parseConnectionString = (input: string): ParsedConnection | null => {
    const match = input
        .trim()
        .match(/^snowflake:\/\/([^:@/\s]+)(?::([^@/\s]*))?@([^/\s?]+)(.*)$/i);
    if (!match) {
        return null;
    }
    const [, user, password, account, rest] = match;
    const values: Partial<Record<ParsedConnectionField, string>> = {
        user: decodeURIComponent(user),
        account: decodeURIComponent(account),
    };
    if (password) {
        values.password = decodeURIComponent(password);
    }

    const pathAndQuery = rest ?? '';
    const [path, query] = pathAndQuery.split('?');
    const pathSegments = (path ?? '')
        .split('/')
        .map((segment) => segment.trim())
        .filter((segment) => segment !== '');
    if (pathSegments[0]) {
        values.database = decodeURIComponent(pathSegments[0]);
    }
    if (pathSegments[1]) {
        values.schema = decodeURIComponent(pathSegments[1]);
    }

    if (query) {
        for (const pair of query.split('&')) {
            const [rawKey, rawValue] = pair.split('=');
            if (!rawKey || rawValue === undefined) continue;
            const field = FIELD_ALIASES[rawKey.trim().toLowerCase()];
            if (field) {
                values[field] = decodeURIComponent(rawValue);
            }
        }
    }

    return finalise('connection_string', values);
};

const parseKeyValues = (
    input: string,
    format: ParsedConnectionFormat,
): ParsedConnection | null => {
    const values: Partial<Record<ParsedConnectionField, string>> = {};
    for (const line of input.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^([A-Za-z_]+)\s*[:=]\s*(.*)$/);
        if (!match) continue;
        const field = FIELD_ALIASES[match[1].trim().toLowerCase()];
        if (field) {
            values[field] = stripQuotes(match[2]);
        }
    }
    return finalise(format, values);
};

export const parseConnectionPaste = (
    input: string,
): ParsedConnection | null => {
    if (typeof input !== 'string' || input.trim() === '') {
        return null;
    }

    const trimmed = input.trim();

    if (/^snowflake:\/\//i.test(trimmed)) {
        return parseConnectionString(trimmed);
    }

    const looksLikeProfilesYml =
        /type:\s*snowflake/i.test(trimmed) ||
        (/\baccount:/i.test(trimmed) && /:/.test(trimmed));

    return parseKeyValues(
        trimmed,
        looksLikeProfilesYml ? 'profiles_yml' : 'key_values',
    );
};

export const maskSecretValue = (value: string): string =>
    value.length === 0 ? '' : '•'.repeat(Math.min(value.length, 12));
