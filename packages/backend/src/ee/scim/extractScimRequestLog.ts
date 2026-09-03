import { ScimRequestAction, ScimSchemaType } from '@lightdash/common';

export type ScimRequestLogExtractionInput = {
    method: string;
    /** Path + query string as received, e.g. `/api/v1/scim/v2/Users?filter=...` */
    originalUrl: string;
    requestBody: unknown;
    responseStatus: number;
    responseBody: unknown;
};

/**
 * The full set of fields ever persisted for a SCIM request. Raw payloads are
 * deliberately not representable here — redaction is structural.
 */
export type ExtractedScimRequestLog = {
    method: string;
    url: string;
    action: ScimRequestAction;
    targetIdentity: string | null;
    targetUuid: string | null;
    affectedRoles: string[];
    status: number;
    errorDetail: string | null;
    scimType: string | null;
};

type ScimPatchOperation = {
    op: string;
    path: string | null;
    value: unknown;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;

const asString = (value: unknown): string | null =>
    typeof value === 'string' && value.length > 0 ? value : null;

// Entra sends booleans as capitalized strings ("False"), Okta as booleans
const isFalseValue = (value: unknown): boolean =>
    value === false ||
    (typeof value === 'string' && value.toLowerCase() === 'false');

const getPatchOperations = (body: unknown): ScimPatchOperation[] => {
    const record = asRecord(body);
    const operations = record?.Operations ?? record?.operations;
    if (!Array.isArray(operations)) return [];
    return operations.flatMap((operation) => {
        const op = asRecord(operation);
        const opName = asString(op?.op);
        if (!op || !opName) return [];
        return [
            {
                op: opName.toLowerCase(),
                path: asString(op.path)?.toLowerCase() ?? null,
                value: op.value,
            },
        ];
    });
};

const opTargets = (operation: ScimPatchOperation, attribute: string): boolean =>
    operation.path?.startsWith(attribute) ??
    asRecord(operation.value)?.[attribute] !== undefined;

const opDeactivates = (operation: ScimPatchOperation): boolean => {
    if (operation.path === 'active') return isFalseValue(operation.value);
    if (operation.path === null) {
        return isFalseValue(asRecord(operation.value)?.active);
    }
    return false;
};

const rolesFromBody = (body: unknown): string[] => {
    const record = asRecord(body);
    if (!record) return [];
    const roles: string[] = [];
    if (Array.isArray(record.roles)) {
        record.roles.forEach((role) => {
            const value = asString(asRecord(role)?.value) ?? asString(role);
            if (value) roles.push(value);
        });
    }
    const extensionRole = asString(
        asRecord(record[ScimSchemaType.LIGHTDASH_USER_EXTENSION])?.role,
    );
    if (extensionRole) roles.push(extensionRole);
    return roles;
};

const rolesFromOperations = (operations: ScimPatchOperation[]): string[] =>
    operations.flatMap((operation) => {
        if (operation.path?.startsWith('roles')) {
            const value = asString(operation.value);
            if (value) return [value];
            return rolesFromBody({ roles: operation.value });
        }
        if (operation.path === null) return rolesFromBody(operation.value);
        return [];
    });

const identityFromOperations = (
    operations: ScimPatchOperation[],
): string | null =>
    operations
        .map((operation) => {
            if (
                operation.path === 'username' ||
                operation.path === 'displayname'
            ) {
                const value = asString(operation.value);
                if (value) return value;
            }
            const record = asRecord(operation.value);
            return asString(record?.userName) ?? asString(record?.displayName);
        })
        .find((identity) => identity !== null) ?? null;

const identityFromFilter = (query: string): string | null => {
    const filter = new URLSearchParams(query).get('filter');
    if (!filter) return null;
    const match = filter.match(
        /(?:userName|displayName|emails(?:\.\w+)?)\s+eq\s+"([^"]+)"/i,
    );
    return match?.[1] ?? null;
};

const identityFromResource = (body: unknown): string | null => {
    const record = asRecord(body);
    return asString(record?.userName) ?? asString(record?.displayName) ?? null;
};

const deriveUserAction = (method: string, body: unknown): ScimRequestAction => {
    switch (method) {
        case 'POST':
            return ScimRequestAction.CREATE_USER;
        case 'DELETE':
            return ScimRequestAction.DELETE_USER;
        case 'PUT':
            return isFalseValue(asRecord(body)?.active)
                ? ScimRequestAction.DEACTIVATE_USER
                : ScimRequestAction.UPDATE_USER;
        case 'PATCH': {
            const operations = getPatchOperations(body);
            if (operations.some(opDeactivates)) {
                return ScimRequestAction.DEACTIVATE_USER;
            }
            if (operations.some((op) => opTargets(op, 'roles'))) {
                return ScimRequestAction.ROLE_CHANGE;
            }
            return ScimRequestAction.UPDATE_USER;
        }
        default:
            return ScimRequestAction.UNKNOWN;
    }
};

const deriveGroupAction = (
    method: string,
    body: unknown,
): ScimRequestAction => {
    switch (method) {
        case 'POST':
            return ScimRequestAction.CREATE_GROUP;
        case 'DELETE':
            return ScimRequestAction.DELETE_GROUP;
        case 'PUT':
            return ScimRequestAction.UPDATE_GROUP;
        case 'PATCH': {
            const operations = getPatchOperations(body);
            if (operations.some((op) => opTargets(op, 'members'))) {
                return ScimRequestAction.MEMBERSHIP_CHANGE;
            }
            return ScimRequestAction.UPDATE_GROUP;
        }
        default:
            return ScimRequestAction.UNKNOWN;
    }
};

const deriveAction = (
    method: string,
    resource: string | null,
    resourceId: string | null,
    body: unknown,
): ScimRequestAction => {
    if (method === 'GET') {
        return resourceId ? ScimRequestAction.LOOKUP : ScimRequestAction.LIST;
    }
    switch (resource) {
        case 'Users':
            return deriveUserAction(method, body);
        case 'Groups':
            return deriveGroupAction(method, body);
        default:
            return ScimRequestAction.UNKNOWN;
    }
};

export const extractScimRequestLog = ({
    method,
    originalUrl,
    requestBody,
    responseStatus,
    responseBody,
}: ScimRequestLogExtractionInput): ExtractedScimRequestLog => {
    const upperMethod = method.toUpperCase();
    const [path, ...queryParts] = originalUrl.split('?');
    const query = queryParts.join('?');

    // Segments after the /api/v1/scim/v2 mount, e.g. ['Users', '<id>']
    const segments = path
        .replace(/^\/api\/v1\/scim\/v2/, '')
        .split('/')
        .filter((segment) => segment.length > 0);
    const resource = segments[0] ?? null;
    const resourceId = segments[1] ?? null;

    const action = deriveAction(upperMethod, resource, resourceId, requestBody);

    const operations = getPatchOperations(requestBody);
    const targetIdentity =
        identityFromResource(requestBody) ??
        identityFromOperations(operations) ??
        identityFromFilter(query) ??
        identityFromResource(responseBody);

    const targetUuid =
        resourceId ?? asString(asRecord(responseBody)?.id) ?? null;

    const affectedRoles = Array.from(
        new Set([
            ...rolesFromBody(requestBody),
            ...rolesFromOperations(operations),
        ]),
    );

    const errorBody = responseStatus >= 400 ? asRecord(responseBody) : null;

    return {
        method: upperMethod,
        url: originalUrl,
        action,
        targetIdentity,
        targetUuid,
        affectedRoles,
        status: responseStatus,
        errorDetail: asString(errorBody?.detail),
        scimType: asString(errorBody?.scimType),
    };
};
