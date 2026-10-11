import {
    AgentCapability,
    assertUnreachable,
    type AgentConnectionGrant,
} from '@lightdash/common';
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

const sameSet = <T>(left: T[], right: T[]): boolean =>
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    left.length === right.length &&
    left.every((value) => right.includes(value));

export const hasValidGrantResourceConstraints = (
    grant: GrantApproval,
): boolean => {
    const parsed = constraintsSchema.safeParse(grant.resourceConstraints);
    if (!parsed.success) return false;
    const constraints = parsed.data;
    switch (constraints.version) {
        case 1:
            return true;
        case 2: {
            const projects = Object.keys(constraints.projectCapabilities);
            const values = Object.values(constraints.projectCapabilities);
            return (
                projects.length > 0 &&
                sameSet(projects, grant.approvedProjectUuids) &&
                values.every(
                    (capabilities) =>
                        new Set(capabilities).size === capabilities.length,
                ) &&
                sameSet([...new Set(values.flat())], grant.approvedCapabilities)
            );
        }
        default:
            return assertUnreachable(
                constraints,
                'Unknown grant resource constraints',
            );
    }
};

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
