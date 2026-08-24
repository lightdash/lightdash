import { SpaceMemberRole } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { type AuditActor } from '../../logging/auditLog';
import {
    auditDirectAccessMutation,
    auditDirectAccessReset,
} from './directAccessAudit';

const actor: AuditActor = {
    type: 'session',
    uuid: 'actor-uuid',
    organizationUuid: 'organization-uuid',
    organizationRole: 'admin',
};

const mutationResult = {
    organizationId: 1,
    organizationUuid: 'organization-uuid',
    projectId: 2,
    projectUuid: 'project-uuid',
};

describe('direct access audit events', () => {
    it.each([
        {
            beforeRole: null,
            afterRole: SpaceMemberRole.VIEWER,
            action: 'direct_access.grant',
        },
        {
            beforeRole: SpaceMemberRole.VIEWER,
            afterRole: SpaceMemberRole.EDITOR,
            action: 'direct_access.role_change',
        },
        {
            beforeRole: SpaceMemberRole.EDITOR,
            afterRole: null,
            action: 'direct_access.revoke',
        },
    ] as const)('emits $action with attribution', (testCase) => {
        const auditLogger = vi.fn();
        auditDirectAccessMutation({
            actor,
            context: { requestId: 'request-id' },
            resourceType: 'Dashboard',
            resourceUuid: 'dashboard-uuid',
            principal: { type: 'user', uuid: 'principal-uuid' },
            result: { ...mutationResult, ...testCase },
            auditLogger,
        });

        expect(auditLogger).toHaveBeenCalledWith(
            expect.objectContaining({
                actor,
                action: testCase.action,
                context: { requestId: 'request-id' },
                status: 'allowed',
                resource: {
                    type: 'Dashboard',
                    organizationUuid: 'organization-uuid',
                    projectUuid: 'project-uuid',
                    metadata: {
                        resourceUuid: 'dashboard-uuid',
                        principalType: 'user',
                        principalUuid: 'principal-uuid',
                        beforeRole: testCase.beforeRole,
                        afterRole: testCase.afterRole,
                    },
                },
            }),
        );
    });

    it('emits reset counts', () => {
        const auditLogger = vi.fn();
        auditDirectAccessReset({
            actor,
            context: {},
            resourceType: 'App',
            resourceUuid: 'app-uuid',
            result: {
                ...mutationResult,
                revokedUsers: 3,
                revokedGroups: 2,
            },
            auditLogger,
        });

        expect(auditLogger).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'direct_access.reset',
                resource: expect.objectContaining({
                    metadata: {
                        resourceUuid: 'app-uuid',
                        revokedUsers: 3,
                        revokedGroups: 2,
                    },
                }),
            }),
        );
    });

    it('does not report a committed mutation as failed when audit logging throws', () => {
        expect(() =>
            auditDirectAccessMutation({
                actor,
                context: {},
                resourceType: 'Dashboard',
                resourceUuid: 'dashboard-uuid',
                principal: { type: 'user', uuid: 'principal-uuid' },
                result: {
                    ...mutationResult,
                    beforeRole: null,
                    afterRole: SpaceMemberRole.VIEWER,
                },
                auditLogger: () => {
                    throw new Error('logger unavailable');
                },
            }),
        ).not.toThrow();
    });
});
