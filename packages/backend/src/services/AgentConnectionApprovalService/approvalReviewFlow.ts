import {
    AgentCapability,
    type AgentConnectionApprovalDecision,
    type AgentConnectionApprovalReview,
} from '@lightdash/common';
import { validate as isUuid, version as uuidVersion } from 'uuid';
import { z } from 'zod';
import { type ApprovalSelection } from '../../database/entities/agentConnectionApprovalRequests';
import { AgentConnectionApprovalError } from './AgentConnectionApprovalError';
import { type ApprovalProject } from './approvalReview';

export const approvalAvailability = (): Pick<
    AgentConnectionApprovalReview,
    'notice'
> => ({
    notice: 'Review only. No connection will be created.',
});

export const isApprovalUuid = (value: string): boolean =>
    isUuid(value) && uuidVersion(value) === 4;

const decisionSchema = z
    .object({
        decision: z.enum(['approve', 'deny']),
        revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
        nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        projectUuids: z
            .array(z.string().refine(isApprovalUuid))
            .max(500)
            .refine((values) => new Set(values).size === values.length),
        capabilities: z
            .array(z.nativeEnum(AgentCapability))
            .max(11)
            .refine((values) => new Set(values).size === values.length),
    })
    .strict();

export const parseApprovalDecision = (
    input: unknown,
): AgentConnectionApprovalDecision => {
    if (typeof input === 'object' && input !== null && !('nonce' in input))
        throw new AgentConnectionApprovalError('csrf_failed');
    const result = decisionSchema.safeParse(input);
    if (!result.success)
        throw new AgentConnectionApprovalError('invalid_approval_request');
    return result.data;
};

export const assertApprovalLoopback = (redirectUri: string): void => {
    const match =
        /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):([0-9]+)\/callback$/.exec(
            redirectUri,
        );
    const port = match ? Number(match[1]) : 0;
    if (
        !match ||
        match[0] !== redirectUri ||
        redirectUri.length > 2048 ||
        !Number.isSafeInteger(port) ||
        port < 1 ||
        port > 65535
    )
        throw new AgentConnectionApprovalError('invalid_approval_request');
};

export const reviewSelection = (
    projects: ApprovalProject[],
): ApprovalSelection => {
    const projectCapabilities = Object.fromEntries(
        projects
            .filter((p) => p.selectable)
            .map((p) => [
                p.projectUuid,
                p.capabilities
                    .filter((c) => c.visibility === 'offered')
                    .map((c) => c.capability),
            ]),
    );
    return {
        approvedProjectUuids: Object.keys(projectCapabilities),
        approvedCapabilities: [
            ...new Set(Object.values(projectCapabilities).flat()),
        ],
        resourceConstraints: { version: 2, projectCapabilities },
    };
};

export const displayedAnswer = (
    selection: ApprovalSelection,
): ApprovalProject[] =>
    selection.approvedProjectUuids.map((projectUuid) => ({
        projectUuid,
        name: '',
        selectable: true,
        reason: null,
        capabilities: selection.resourceConstraints.projectCapabilities[
            projectUuid
        ].map((capability) => ({
            capability,
            visibility: 'offered',
            reasonCode: null,
            reason: null,
        })),
    }));

export const narrowReviewAnswer = (
    current: ApprovalProject[],
    displayed: ApprovalSelection,
): ApprovalProject[] =>
    current
        .filter((p) => displayed.approvedProjectUuids.includes(p.projectUuid))
        .map((p) => ({
            ...p,
            capabilities: p.capabilities.map((c) =>
                c.visibility === 'offered' &&
                !displayed.resourceConstraints.projectCapabilities[
                    p.projectUuid
                ].includes(c.capability)
                    ? {
                          ...c,
                          visibility: 'blocked',
                          reasonCode: 'not_reviewed',
                          reason: 'This action was not included in the previous review.',
                      }
                    : c,
            ),
        }));

export class ApprovalAnswerChanged extends Error {
    constructor(readonly projects: ApprovalProject[]) {
        super('approval_selection_changed');
    }
}
