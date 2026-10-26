import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export type PersonalLogin = {
    clientId: 'lightdash-cli';
    personUuid: string;
    organizationUuid: string;
    tokens: {
        accessToken: string;
        accessTokenIssuedAt: string;
        accessTokenExpiresAt: string;
        refreshToken: string;
        scopes: string[];
        generation: number;
        lastRefreshAttemptUuid: string | null;
    };
    sessionExpiresAt: string;
    refreshState:
        | { kind: 'idle' }
        | { kind: 'in_progress'; attemptUuid: string; startedAt: string }
        | { kind: 'login_required'; since: string };
};
export const invalidLogin = (): Error =>
    new Error('Invalid personal login data. Run `lightdash login` again.');
const text = { type: 'string', minLength: 1, maxLength: 16384 };
const uuid = { type: 'string', format: 'uuid' };
const date = {
    type: 'string',
    format: 'date-time',
    pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:[0-5]\\d\\.\\d{3}Z$',
};
const object = (properties: Record<string, object>) => ({
    type: 'object',
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
});
const ajv = new Ajv();
addFormats(ajv);
const validate = ajv.compile<PersonalLogin>(
    object({
        clientId: { const: 'lightdash-cli' },
        personUuid: uuid,
        organizationUuid: uuid,
        tokens: object({
            accessToken: text,
            accessTokenIssuedAt: date,
            accessTokenExpiresAt: date,
            refreshToken: text,
            scopes: {
                type: 'array',
                items: { enum: ['read', 'write'] },
                minItems: 2,
                maxItems: 2,
                uniqueItems: true,
            },
            generation: {
                type: 'integer',
                minimum: 1,
                maximum: Number.MAX_SAFE_INTEGER,
            },
            lastRefreshAttemptUuid: { anyOf: [uuid, { type: 'null' }] },
        }),
        sessionExpiresAt: date,
        refreshState: {
            oneOf: [
                object({ kind: { const: 'idle' } }),
                object({
                    kind: { const: 'in_progress' },
                    attemptUuid: uuid,
                    startedAt: date,
                }),
                object({ kind: { const: 'login_required' }, since: date }),
            ],
        },
    }),
);
export const validatePersonalLogin = (value: unknown): PersonalLogin => {
    if (
        !validate(value) ||
        Date.parse(value.tokens.accessTokenExpiresAt) >
            Date.parse(value.sessionExpiresAt) ||
        Date.parse(value.tokens.accessTokenIssuedAt) >=
            Date.parse(value.tokens.accessTokenExpiresAt)
    )
        throw invalidLogin();
    return value;
};
