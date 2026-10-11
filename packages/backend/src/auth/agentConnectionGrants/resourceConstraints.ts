import {
    AgentCapability,
    assertUnreachable,
    type AgentConnectionGrant,
} from '@lightdash/common';
import { validate as isUuid } from 'uuid';
import { z } from 'zod';

type GrantApproval = Pick<
    AgentConnectionGrant,
    'resourceConstraints' | 'approvedProjectUuids' | 'approvedCapabilities'
>;

const constraintsSchema = z.discriminatedUnion('version', [
    z.object({ version: z.literal(1) }),
    z.object({
        version: z.literal(2),
        projectCapabilities: z.record(
            z.string().min(1),
            z.array(z.enum(AgentCapability)),
        ),
    }),
]);

export const MAX_AGENT_CONNECTION_PROJECTS = 500;

const sameSet = <T>(left: T[], right: T[]): boolean => {
    const rightSet = new Set(right);
    return (
        new Set(left).size === left.length &&
        rightSet.size === right.length &&
        left.length === right.length &&
        left.every((value) => rightSet.has(value))
    );
};

export const parseGrantResourceConstraints = (
    grant: GrantApproval,
): AgentConnectionGrant['resourceConstraints'] | null => {
    if (
        grant.approvedProjectUuids.length > MAX_AGENT_CONNECTION_PROJECTS ||
        grant.approvedCapabilities.some(
            (capability) =>
                !Object.values(AgentCapability).includes(capability),
        )
    )
        return null;
    const raw = grant.resourceConstraints;
    if (raw?.version === 2) {
        const map = raw.projectCapabilities;
        if (
            !map ||
            typeof map !== 'object' ||
            Array.isArray(map) ||
            Object.getPrototypeOf(map) !== Object.prototype
        )
            return null;
        const keys = Object.keys(map);
        if (
            keys.length === 0 ||
            keys.length > MAX_AGENT_CONNECTION_PROJECTS ||
            keys.some(
                (key) =>
                    ['__proto__', 'constructor', 'prototype'].includes(key) ||
                    !isUuid(key),
            ) ||
            !sameSet(keys, grant.approvedProjectUuids)
        )
            return null;
    }
    const parsed = constraintsSchema.safeParse(raw);
    if (!parsed.success) return null;
    const constraints = parsed.data;
    switch (constraints.version) {
        case 1:
            return constraints;
        case 2: {
            const values = Object.values(constraints.projectCapabilities);
            if (
                !values.every(
                    (capabilities) =>
                        new Set(capabilities).size === capabilities.length,
                ) ||
                !sameSet(
                    [...new Set(values.flat())],
                    grant.approvedCapabilities,
                )
            )
                return null;
            return {
                version: 2,
                projectCapabilities: Object.fromEntries(
                    Object.entries(constraints.projectCapabilities)
                        .sort(([left], [right]) => left.localeCompare(right))
                        .map(([key, capabilities]) => [key, [...capabilities]]),
                ),
            };
        }
        default:
            return assertUnreachable(
                constraints,
                'Unknown grant resource constraints',
            );
    }
};

export const hasValidGrantResourceConstraints = (
    grant: GrantApproval,
): boolean => parseGrantResourceConstraints(grant) !== null;

export const grantAllowsCapabilities = (
    grant: GrantApproval,
    projectUuids: readonly string[],
    capabilities: readonly AgentCapability[],
): boolean => {
    if (
        !hasValidGrantResourceConstraints(grant) ||
        capabilities.some(
            (capability) =>
                !Object.values(AgentCapability).includes(capability) ||
                !grant.approvedCapabilities.includes(capability),
        )
    )
        return false;
    const constraints = grant.resourceConstraints;
    switch (constraints.version) {
        case 1:
            return true;
        case 2:
            return projectUuids.every(
                (uuid) =>
                    Object.hasOwn(constraints.projectCapabilities, uuid) &&
                    capabilities.every((capability) =>
                        constraints.projectCapabilities[uuid].includes(
                            capability,
                        ),
                    ),
            );
        default:
            return assertUnreachable(
                constraints,
                'Unknown grant resource constraints',
            );
    }
};
