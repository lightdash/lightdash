import { ParameterError } from '../errors';
import type { GroupAsCode } from '../groups';
import type { CustomRoleAsCode, RoleLevel } from '../roles';
import type { UserAsCode, UserAsCodeRole } from '../user';
import type { UserAttributeAsCode } from '../userAttributes';
import { CONTENT_AS_CODE_VERSION } from './base';

type CodeObject = Record<string, unknown>;

const asCodeObject = (
    value: unknown,
    resourceLabel: string,
    source: string,
): CodeObject => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new ParameterError(
            `Invalid ${resourceLabel} file "${source}": expected a YAML object`,
        );
    }
    return value as CodeObject;
};

const requireVersionOne = (
    value: CodeObject,
    resourceLabel: string,
    source: string,
): void => {
    if (value.version !== CONTENT_AS_CODE_VERSION) {
        throw new ParameterError(
            `Invalid ${resourceLabel} file "${source}": expected version ${CONTENT_AS_CODE_VERSION}`,
        );
    }
};

const requireString = (
    value: CodeObject,
    key: string,
    resourceLabel: string,
    source: string,
): string => {
    const property = value[key];
    if (typeof property !== 'string' || property.trim().length === 0) {
        throw new ParameterError(
            `Invalid ${resourceLabel} file "${source}": expected a non-empty ${key}`,
        );
    }
    return property;
};

const requireStringArray = (
    value: CodeObject,
    key: string,
    resourceLabel: string,
    source: string,
): string[] => {
    const property = value[key];
    if (
        !Array.isArray(property) ||
        property.some((item) => typeof item !== 'string')
    ) {
        throw new ParameterError(
            `Invalid ${resourceLabel} file "${source}": expected ${key} to be an array of strings`,
        );
    }
    return property;
};

export const parseVersionedContentAsCodeDocument = <Document>({
    input,
    source,
    resourceLabel,
    contentType,
    version = CONTENT_AS_CODE_VERSION,
    identityKey = 'slug',
}: {
    input: unknown;
    source: string;
    resourceLabel: string;
    contentType: string;
    version?: number;
    identityKey?: string;
}): Document => {
    const value = asCodeObject(input, resourceLabel, source);
    if (value.contentType !== contentType) {
        throw new ParameterError(
            `Invalid contentType in ${resourceLabel} file "${source}": expected "${contentType}"`,
        );
    }
    if (value.version !== version) {
        throw new ParameterError(
            `Invalid ${resourceLabel} file "${source}": expected version ${version}`,
        );
    }
    requireString(value, identityKey, resourceLabel, source);
    return value as Document;
};

export const parseCustomRoleAsCode = (
    input: unknown,
    source: string,
): CustomRoleAsCode => {
    const value = asCodeObject(input, 'custom role', source);
    requireVersionOne(value, 'custom role', source);
    const name = requireString(value, 'name', 'custom role', source);
    if (value.description !== null && typeof value.description !== 'string') {
        throw new ParameterError(
            `Invalid custom role file "${source}": expected description to be a string or null`,
        );
    }
    if (value.level !== 'project' && value.level !== 'organization') {
        throw new ParameterError(
            `Invalid custom role file "${source}": expected level to be project or organization`,
        );
    }
    return {
        version: CONTENT_AS_CODE_VERSION,
        name,
        description: value.description,
        level: value.level as RoleLevel,
        scopes: requireStringArray(value, 'scopes', 'custom role', source),
    };
};

export const parseGroupAsCode = (
    input: unknown,
    source: string,
): GroupAsCode => {
    const value = asCodeObject(input, 'group', source);
    requireVersionOne(value, 'group', source);
    return {
        version: CONTENT_AS_CODE_VERSION,
        name: requireString(value, 'name', 'group', source),
        members: requireStringArray(value, 'members', 'group', source),
    };
};

const parseUserRole = (value: unknown, source: string): UserAsCodeRole => {
    const role = asCodeObject(value, 'user role', source);
    if (role.type !== 'system' && role.type !== 'custom') {
        throw new ParameterError(
            `Invalid user file "${source}": expected role type to be system or custom`,
        );
    }
    return {
        type: role.type,
        name: requireString(role, 'name', 'user', source),
    } as UserAsCodeRole;
};

const parseAdditionalUserRoles = (
    value: unknown,
    source: string,
): Extract<UserAsCodeRole, { type: 'custom' }>[] => {
    if (!Array.isArray(value)) {
        throw new ParameterError(
            `Invalid user file "${source}": expected additionalRoles to be an array`,
        );
    }
    return value.map((entry) => {
        const role = parseUserRole(entry, source);
        if (role.type !== 'custom') {
            throw new ParameterError(
                `Invalid user file "${source}": additionalRoles may only contain custom roles`,
            );
        }
        return role;
    });
};

export const parseUserAsCode = (input: unknown, source: string): UserAsCode => {
    const value = asCodeObject(input, 'user', source);
    requireVersionOne(value, 'user', source);
    if (typeof value.disabled !== 'boolean') {
        throw new ParameterError(
            `Invalid user file "${source}": expected disabled to be a boolean`,
        );
    }
    const additionalRoles =
        value.additionalRoles === undefined
            ? undefined
            : parseAdditionalUserRoles(value.additionalRoles, source);
    return {
        version: CONTENT_AS_CODE_VERSION,
        email: requireString(value, 'email', 'user', source),
        disabled: value.disabled,
        role: parseUserRole(value.role, source),
        ...(additionalRoles ? { additionalRoles } : {}),
    };
};

export const parseUserAttributeAsCode = (
    input: unknown,
    source: string,
): UserAttributeAsCode => {
    const label = 'user attribute';
    const value = asCodeObject(input, label, source);
    requireVersionOne(value, label, source);
    const checkKeys = (object: CodeObject, allowed: string[]) => {
        const unknown = Object.keys(object).filter(
            (key) => !allowed.includes(key),
        );
        if (unknown.length > 0) {
            throw new ParameterError(
                `Invalid user attribute file "${source}": unknown fields ${unknown.join(', ')}`,
            );
        }
    };
    checkKeys(value, [
        'version',
        'name',
        'description',
        'attributeDefaults',
        'users',
        'groups',
    ]);
    const name = requireString(value, 'name', label, source);
    if (name !== name.trim()) {
        throw new ParameterError(
            'User attribute name must not have surrounding whitespace',
        );
    }
    if (value.description !== null && typeof value.description !== 'string') {
        throw new ParameterError(
            `Invalid user attribute file "${source}": expected description to be a string or null`,
        );
    }
    const parseValues = (object: CodeObject, key: string): string[] => {
        const values = requireStringArray(object, key, label, source);
        if (values.some((entry) => entry.length === 0)) {
            throw new ParameterError(
                `Invalid user attribute file "${source}": ${key} must not contain empty strings`,
            );
        }
        return [...new Set(values)].sort();
    };
    const parseAssignments = (
        key: 'users' | 'groups',
        identityKey: 'email' | 'name',
    ) => {
        const assignments = value[key];
        if (!Array.isArray(assignments)) {
            throw new ParameterError(
                `Invalid user attribute file "${source}": expected ${key} to be an array`,
            );
        }
        const identities = new Set<string>();
        return assignments
            .map((entry) => {
                const assignment = asCodeObject(entry, label, source);
                checkKeys(assignment, [identityKey, 'values']);
                const rawIdentity = requireString(
                    assignment,
                    identityKey,
                    label,
                    source,
                );
                const identity =
                    identityKey === 'email'
                        ? rawIdentity.toLowerCase()
                        : rawIdentity;
                if (identity !== identity.trim()) {
                    throw new ParameterError(
                        `Invalid user attribute ${identityKey}: ${identity}`,
                    );
                }
                if (identities.has(identity)) {
                    throw new ParameterError(
                        `Duplicate user attribute ${identityKey}: ${identity}`,
                    );
                }
                identities.add(identity);
                return { identity, values: parseValues(assignment, 'values') };
            })
            .sort((a, b) => a.identity.localeCompare(b.identity));
    };
    const defaults =
        value.attributeDefaults === null
            ? null
            : parseValues(value, 'attributeDefaults');
    return {
        version: CONTENT_AS_CODE_VERSION,
        name,
        description: value.description || null,
        attributeDefaults: defaults?.length ? defaults : null,
        users: parseAssignments('users', 'email').map(
            ({ identity, values }) => ({ email: identity, values }),
        ),
        groups: parseAssignments('groups', 'name').map(
            ({ identity, values }) => ({ name: identity, values }),
        ),
    };
};
