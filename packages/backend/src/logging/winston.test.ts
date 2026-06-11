import { AuditLogEvent } from './auditLog';
import {
    formatAuditAction,
    formatAuditActor,
    formatAuditMessage,
    formatAuditResource,
} from './winston';

describe('formatAuditAction', () => {
    it('converts known actions to past tense', () => {
        expect(formatAuditAction('view')).toBe('viewed');
        expect(formatAuditAction('create')).toBe('created');
        expect(formatAuditAction('update')).toBe('updated');
        expect(formatAuditAction('delete')).toBe('deleted');
        expect(formatAuditAction('manage')).toBe('managed');
        expect(formatAuditAction('run')).toBe('ran');
        expect(formatAuditAction('login')).toBe('logged in');
        expect(formatAuditAction('logout')).toBe('logged out');
        expect(formatAuditAction('promote')).toBe('promoted');
    });

    it('returns unknown actions as-is', () => {
        expect(formatAuditAction('custom_action')).toBe('custom_action');
    });
});

describe('formatAuditActor', () => {
    it('shows email for session user', () => {
        expect(
            formatAuditActor({
                type: 'session',
                uuid: 'user-uuid',
                email: 'john@company.com',
                firstName: 'John',
                lastName: 'Doe',
                organizationUuid: 'org-uuid',
                organizationRole: 'admin',
            }),
        ).toBe('john@company.com');
    });

    it('falls back to name when email is missing', () => {
        expect(
            formatAuditActor({
                type: 'session',
                uuid: 'user-uuid',
                email: '',
                firstName: 'John',
                lastName: 'Doe',
                organizationUuid: 'org-uuid',
                organizationRole: 'admin',
            }),
        ).toBe('John Doe');
    });

    it('falls back to uuid when email and name are missing', () => {
        expect(
            formatAuditActor({
                type: 'pat',
                uuid: 'user-uuid',
                email: '',
                firstName: '',
                lastName: '',
                organizationUuid: 'org-uuid',
                organizationRole: 'admin',
            }),
        ).toBe('user-uuid');
    });

    it('shows service-account with description', () => {
        expect(
            formatAuditActor({
                type: 'service-account',
                uuid: 'sa-uuid',
                description: 'ci-deploy',
                organizationUuid: 'org-uuid',
                organizationRole: 'admin',
            }),
        ).toBe('service-account "ci-deploy"');
    });

    it('shows service-account with uuid when description is missing', () => {
        expect(
            formatAuditActor({
                type: 'service-account',
                uuid: 'sa-uuid',
                organizationUuid: 'org-uuid',
                organizationRole: 'admin',
            }),
        ).toBe('service-account sa-uuid');
    });

    it('shows anonymous user', () => {
        expect(
            formatAuditActor({
                type: 'anonymous',
                uuid: 'anon-uuid',
                organizationUuid: 'org-uuid',
            }),
        ).toBe('anonymous user');
    });
});

describe('formatAuditResource', () => {
    it('renders all metadata entries as key: value pairs', () => {
        expect(
            formatAuditResource({
                type: 'Dashboard',
                metadata: {
                    dashboardUuid: 'dash-uuid',
                    dashboardName: 'Sales Overview',
                },
                organizationUuid: 'org-uuid',
            }),
        ).toBe(
            'Dashboard -> dashboardUuid: dash-uuid, dashboardName: Sales Overview',
        );
    });

    it('renders a single metadata entry', () => {
        expect(
            formatAuditResource({
                type: 'Dashboard',
                metadata: { dashboardUuid: 'dash-uuid' },
                organizationUuid: 'org-uuid',
            }),
        ).toBe('Dashboard -> dashboardUuid: dash-uuid');
    });

    it('renders Project metadata even when it duplicates projectUuid', () => {
        expect(
            formatAuditResource({
                type: 'Project',
                metadata: { projectUuid: 'proj-uuid' },
                organizationUuid: 'org-uuid',
                projectUuid: 'proj-uuid',
            }),
        ).toBe('Project -> projectUuid: proj-uuid');
    });

    it('falls back to project context when metadata is absent', () => {
        expect(
            formatAuditResource({
                type: 'Explore',
                organizationUuid: 'org-uuid',
                projectUuid: 'proj-uuid',
            }),
        ).toBe('Explore in project proj-uuid');
    });

    it('falls back to org context when only org uuid is available', () => {
        expect(
            formatAuditResource({
                type: 'CustomSql',
                organizationUuid: 'org-uuid',
            }),
        ).toBe('CustomSql in organization org-uuid');
    });

    it('shows just type when no metadata, project, or org is available', () => {
        expect(
            formatAuditResource({
                type: 'CustomSql',
                organizationUuid: '',
            }),
        ).toBe('CustomSql');
    });
});

describe('formatAuditMessage', () => {
    const baseEvent: AuditLogEvent = {
        id: 'event-uuid',
        timestamp: '2026-04-02T15:00:00.000Z',
        actor: {
            type: 'session',
            uuid: 'user-uuid',
            email: 'john@company.com',
            firstName: 'John',
            lastName: 'Doe',
            organizationUuid: 'org-uuid',
            organizationRole: 'admin',
        },
        action: 'update',
        resource: {
            type: 'Dashboard',
            metadata: {
                dashboardUuid: 'dash-uuid',
                dashboardName: 'Sales Overview',
            },
            organizationUuid: 'org-uuid',
            projectUuid: 'proj-uuid',
        },
        context: {},
        status: 'allowed',
    };

    it('formats a full allowed event', () => {
        expect(formatAuditMessage(baseEvent)).toBe(
            'john@company.com updated Dashboard -> dashboardUuid: dash-uuid, dashboardName: Sales Overview (allowed)',
        );
    });

    it('formats a denied event with reason', () => {
        expect(
            formatAuditMessage({
                ...baseEvent,
                status: 'denied',
                reason: 'Insufficient permissions',
            }),
        ).toBe(
            'john@company.com updated Dashboard -> dashboardUuid: dash-uuid, dashboardName: Sales Overview (denied) - Insufficient permissions',
        );
    });

    it('formats permission-type subject without uuid', () => {
        expect(
            formatAuditMessage({
                ...baseEvent,
                action: 'view',
                resource: {
                    type: 'Explore',
                    organizationUuid: 'org-uuid',
                    projectUuid: 'proj-uuid',
                },
            }),
        ).toBe(
            'john@company.com viewed Explore in project proj-uuid (allowed)',
        );
    });

    it('formats service account event without attribution caveat', () => {
        expect(
            formatAuditMessage({
                ...baseEvent,
                actor: {
                    type: 'service-account',
                    uuid: 'sa-uuid',
                    description: 'ci-deploy',
                    organizationUuid: 'org-uuid',
                    organizationRole: 'admin',
                },
                action: 'manage',
                resource: {
                    type: 'Group',
                    metadata: {
                        groupUuid: 'group-uuid',
                        groupName: 'Engineering',
                    },
                    organizationUuid: 'org-uuid',
                },
            }),
        ).toBe(
            'service-account "ci-deploy" managed Group -> groupUuid: group-uuid, groupName: Engineering (allowed)',
        );
    });

    it('formats anonymous user event', () => {
        expect(
            formatAuditMessage({
                ...baseEvent,
                actor: {
                    type: 'anonymous',
                    uuid: 'anon-uuid',
                    organizationUuid: 'org-uuid',
                },
                action: 'view',
            }),
        ).toBe(
            'anonymous user viewed Dashboard -> dashboardUuid: dash-uuid, dashboardName: Sales Overview (allowed)',
        );
    });
});
