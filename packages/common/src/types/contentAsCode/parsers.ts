import { ParameterError } from '../errors';
import type { GroupAsCode } from '../groups';
import type { CustomRoleAsCode, RoleLevel } from '../roles';
import type { UserAsCode, UserAsCodeRole } from '../user';
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

export const parseUserAsCode = (input: unknown, source: string): UserAsCode => {
    const value = asCodeObject(input, 'user', source);
    requireVersionOne(value, 'user', source);
    if (typeof value.disabled !== 'boolean') {
        throw new ParameterError(
            `Invalid user file "${source}": expected disabled to be a boolean`,
        );
    }
    return {
        version: CONTENT_AS_CODE_VERSION,
        email: requireString(value, 'email', 'user', source),
        disabled: value.disabled,
        role: parseUserRole(value.role, source),
    };
};
