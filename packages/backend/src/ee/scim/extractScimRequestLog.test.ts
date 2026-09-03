import { ScimRequestAction } from '@lightdash/common';
import { extractScimRequestLog } from './extractScimRequestLog';

describe('extractScimRequestLog', () => {
    describe('user mutations', () => {
        it('extracts Okta create-user with password without leaking it', () => {
            const record = extractScimRequestLog({
                method: 'POST',
                originalUrl: '/api/v1/scim/v2/Users',
                requestBody: {
                    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
                    userName: 'jane@acme.com',
                    name: { givenName: 'Jane', familyName: 'Doe' },
                    emails: [{ value: 'jane@acme.com', primary: true }],
                    password: 'super-secret',
                    active: true,
                },
                responseStatus: 201,
                responseBody: {
                    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
                    id: 'a3d5c1f2-0000-0000-0000-000000000001',
                    userName: 'jane@acme.com',
                },
            });
            expect(record).toEqual({
                method: 'POST',
                url: '/api/v1/scim/v2/Users',
                action: ScimRequestAction.CREATE_USER,
                targetIdentity: 'jane@acme.com',
                targetUuid: 'a3d5c1f2-0000-0000-0000-000000000001',
                affectedRoles: [],
                status: 201,
                errorDetail: null,
                scimType: null,
            });
            expect(JSON.stringify(record)).not.toContain('super-secret');
        });

        it('extracts Okta PUT full-replace with roles', () => {
            const record = extractScimRequestLog({
                method: 'PUT',
                originalUrl:
                    '/api/v1/scim/v2/Users/a3d5c1f2-0000-0000-0000-000000000001',
                requestBody: {
                    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
                    userName: 'jane@acme.com',
                    active: true,
                    roles: [{ value: 'editor', primary: true }],
                },
                responseStatus: 200,
                responseBody: { id: 'a3d5c1f2-0000-0000-0000-000000000001' },
            });
            expect(record.action).toBe(ScimRequestAction.UPDATE_USER);
            expect(record.targetUuid).toBe(
                'a3d5c1f2-0000-0000-0000-000000000001',
            );
            expect(record.targetIdentity).toBe('jane@acme.com');
            expect(record.affectedRoles).toEqual(['editor']);
        });

        it('classifies PUT with active=false as deactivate', () => {
            const record = extractScimRequestLog({
                method: 'PUT',
                originalUrl: '/api/v1/scim/v2/Users/user-1',
                requestBody: { userName: 'jane@acme.com', active: false },
                responseStatus: 200,
                responseBody: {},
            });
            expect(record.action).toBe(ScimRequestAction.DEACTIVATE_USER);
        });

        it('classifies Entra PATCH with capitalized op and string "False" as deactivate', () => {
            const record = extractScimRequestLog({
                method: 'PATCH',
                originalUrl: '/api/v1/scim/v2/Users/user-1',
                requestBody: {
                    schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
                    Operations: [
                        { op: 'Replace', path: 'active', value: 'False' },
                    ],
                },
                responseStatus: 200,
                responseBody: {},
            });
            expect(record.action).toBe(ScimRequestAction.DEACTIVATE_USER);
        });

        it('classifies Entra role-assignment PATCH as role change', () => {
            const record = extractScimRequestLog({
                method: 'PATCH',
                originalUrl: '/api/v1/scim/v2/Users/user-1',
                requestBody: {
                    schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
                    Operations: [
                        {
                            op: 'Add',
                            path: 'roles[primary eq "True"].value',
                            value: 'developer',
                        },
                    ],
                },
                responseStatus: 200,
                responseBody: {},
            });
            expect(record.action).toBe(ScimRequestAction.ROLE_CHANGE);
            expect(record.affectedRoles).toEqual(['developer']);
        });

        it('classifies Okta pathless PATCH carrying roles as role change', () => {
            const record = extractScimRequestLog({
                method: 'PATCH',
                originalUrl: '/api/v1/scim/v2/Users/user-1',
                requestBody: {
                    schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
                    Operations: [
                        {
                            op: 'replace',
                            value: {
                                roles: [
                                    { value: 'admin' },
                                    { value: 'viewer' },
                                ],
                            },
                        },
                    ],
                },
                responseStatus: 200,
                responseBody: {},
            });
            expect(record.action).toBe(ScimRequestAction.ROLE_CHANGE);
            expect(record.affectedRoles).toEqual(['admin', 'viewer']);
        });

        it('picks up the deprecated Lightdash role extension field', () => {
            const record = extractScimRequestLog({
                method: 'POST',
                originalUrl: '/api/v1/scim/v2/Users',
                requestBody: {
                    userName: 'sam@acme.com',
                    'urn:lightdash:params:scim:schemas:extension:2.0:User': {
                        role: 'interactive_viewer',
                    },
                },
                responseStatus: 201,
                responseBody: { id: 'user-2' },
            });
            expect(record.action).toBe(ScimRequestAction.CREATE_USER);
            expect(record.affectedRoles).toEqual(['interactive_viewer']);
        });

        it('classifies PATCH without active/roles ops as update', () => {
            const record = extractScimRequestLog({
                method: 'PATCH',
                originalUrl: '/api/v1/scim/v2/Users/user-1',
                requestBody: {
                    Operations: [
                        {
                            op: 'replace',
                            path: 'name.givenName',
                            value: 'Janet',
                        },
                    ],
                },
                responseStatus: 200,
                responseBody: { userName: 'jane@acme.com' },
            });
            expect(record.action).toBe(ScimRequestAction.UPDATE_USER);
            expect(record.targetIdentity).toBe('jane@acme.com');
        });

        it('classifies DELETE user', () => {
            const record = extractScimRequestLog({
                method: 'DELETE',
                originalUrl: '/api/v1/scim/v2/Users/user-1',
                requestBody: undefined,
                responseStatus: 204,
                responseBody: undefined,
            });
            expect(record.action).toBe(ScimRequestAction.DELETE_USER);
            expect(record.targetUuid).toBe('user-1');
        });
    });

    describe('groups', () => {
        it('classifies group create with displayName as identity', () => {
            const record = extractScimRequestLog({
                method: 'POST',
                originalUrl: '/api/v1/scim/v2/Groups',
                requestBody: {
                    schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
                    displayName: 'Engineering',
                    members: [],
                },
                responseStatus: 201,
                responseBody: { id: 'group-1', displayName: 'Engineering' },
            });
            expect(record.action).toBe(ScimRequestAction.CREATE_GROUP);
            expect(record.targetIdentity).toBe('Engineering');
            expect(record.targetUuid).toBe('group-1');
        });

        it('classifies member add PATCH as membership change', () => {
            const record = extractScimRequestLog({
                method: 'PATCH',
                originalUrl: '/api/v1/scim/v2/Groups/group-1',
                requestBody: {
                    Operations: [
                        {
                            op: 'add',
                            path: 'members',
                            value: [{ value: 'user-1' }],
                        },
                    ],
                },
                responseStatus: 200,
                responseBody: { displayName: 'Engineering' },
            });
            expect(record.action).toBe(ScimRequestAction.MEMBERSHIP_CHANGE);
            expect(record.targetIdentity).toBe('Engineering');
        });

        it('classifies member remove with filter path as membership change', () => {
            const record = extractScimRequestLog({
                method: 'PATCH',
                originalUrl: '/api/v1/scim/v2/Groups/group-1',
                requestBody: {
                    Operations: [
                        {
                            op: 'Remove',
                            path: 'members[value eq "user-1"]',
                        },
                    ],
                },
                responseStatus: 204,
                responseBody: undefined,
            });
            expect(record.action).toBe(ScimRequestAction.MEMBERSHIP_CHANGE);
        });

        it('classifies group rename PATCH as group update', () => {
            const record = extractScimRequestLog({
                method: 'PATCH',
                originalUrl: '/api/v1/scim/v2/Groups/group-1',
                requestBody: {
                    Operations: [
                        {
                            op: 'replace',
                            path: 'displayName',
                            value: 'Platform',
                        },
                    ],
                },
                responseStatus: 200,
                responseBody: {},
            });
            expect(record.action).toBe(ScimRequestAction.UPDATE_GROUP);
            expect(record.targetIdentity).toBe('Platform');
        });

        it('classifies group delete', () => {
            const record = extractScimRequestLog({
                method: 'DELETE',
                originalUrl: '/api/v1/scim/v2/Groups/group-1',
                requestBody: undefined,
                responseStatus: 204,
                responseBody: undefined,
            });
            expect(record.action).toBe(ScimRequestAction.DELETE_GROUP);
        });
    });

    describe('reads', () => {
        it('extracts the identity from an encoded Entra filter probe', () => {
            const record = extractScimRequestLog({
                method: 'GET',
                originalUrl:
                    '/api/v1/scim/v2/Users?filter=userName%20eq%20%22jane%40acme.com%22&startIndex=1&count=100',
                requestBody: undefined,
                responseStatus: 200,
                responseBody: { totalResults: 0, Resources: [] },
            });
            expect(record.action).toBe(ScimRequestAction.LIST);
            expect(record.targetIdentity).toBe('jane@acme.com');
            expect(record.url).toBe(
                '/api/v1/scim/v2/Users?filter=userName%20eq%20%22jane%40acme.com%22&startIndex=1&count=100',
            );
        });

        it('classifies a plain list sweep', () => {
            const record = extractScimRequestLog({
                method: 'GET',
                originalUrl: '/api/v1/scim/v2/Users?startIndex=1&count=100',
                requestBody: undefined,
                responseStatus: 200,
                responseBody: { totalResults: 5 },
            });
            expect(record.action).toBe(ScimRequestAction.LIST);
            expect(record.targetIdentity).toBeNull();
        });

        it('classifies a lookup and derives identity from the response', () => {
            const record = extractScimRequestLog({
                method: 'GET',
                originalUrl: '/api/v1/scim/v2/Users/user-1',
                requestBody: undefined,
                responseStatus: 200,
                responseBody: { id: 'user-1', userName: 'jane@acme.com' },
            });
            expect(record.action).toBe(ScimRequestAction.LOOKUP);
            expect(record.targetIdentity).toBe('jane@acme.com');
            expect(record.targetUuid).toBe('user-1');
        });
    });

    describe('errors', () => {
        it('captures SCIM error detail and scimType', () => {
            const record = extractScimRequestLog({
                method: 'POST',
                originalUrl: '/api/v1/scim/v2/Users',
                requestBody: { userName: 'jane@acme.com' },
                responseStatus: 409,
                responseBody: {
                    schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
                    detail: 'User already exists in the organization',
                    scimType: 'uniqueness',
                    status: '409',
                },
            });
            expect(record.status).toBe(409);
            expect(record.errorDetail).toBe(
                'User already exists in the organization',
            );
            expect(record.scimType).toBe('uniqueness');
        });

        it('leaves error fields null on success responses', () => {
            const record = extractScimRequestLog({
                method: 'GET',
                originalUrl: '/api/v1/scim/v2/Users',
                requestBody: undefined,
                responseStatus: 200,
                responseBody: { detail: 'not-an-error' },
            });
            expect(record.errorDetail).toBeNull();
            expect(record.scimType).toBeNull();
        });
    });

    describe('redaction', () => {
        it('only ever emits the whitelisted keys', () => {
            const record = extractScimRequestLog({
                method: 'POST',
                originalUrl: '/api/v1/scim/v2/Users',
                requestBody: {
                    userName: 'jane@acme.com',
                    password: 'super-secret',
                    anythingElse: { nested: 'payload' },
                },
                responseStatus: 201,
                responseBody: { id: 'user-1' },
            });
            expect(Object.keys(record).sort()).toEqual(
                [
                    'action',
                    'affectedRoles',
                    'errorDetail',
                    'method',
                    'scimType',
                    'status',
                    'targetIdentity',
                    'targetUuid',
                    'url',
                ].sort(),
            );
        });

        it('never throws on garbage input', () => {
            const record = extractScimRequestLog({
                method: 'PATCH',
                originalUrl: '/api/v1/scim/v2/Users/user-1',
                requestBody: 'not-json-at-all',
                responseStatus: 500,
                responseBody: 42,
            });
            expect(record.action).toBe(ScimRequestAction.UPDATE_USER);
            expect(record.targetIdentity).toBeNull();
        });
    });
});
