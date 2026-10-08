import {
    MissingConfigError,
    NotFoundError,
    ParameterError,
    type SetPrimaryDepartment,
} from '@lightdash/common';
import { fetchMiddlewares } from '@tsoa/runtime';
import { type Request } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { type ServiceRepository } from '../../services/ServiceRepository';
import { OrgDepartmentsController } from './OrgDepartmentsController';

const DEPARTMENT = '6b1f0d7e-2c4a-4e8b-9f3d-1a2b3c4d5e6f';
const MARKETING = 'a3e9c2d1-5b7f-4c6a-8e0d-2f1a3b4c5d6e';
const SALES = 'c8d7e6f5-4a3b-4c2d-b1e0-9f8e7d6c5b4a';
const FINANCE = 'd4c3b2a1-9e8f-4a7b-8c6d-5e4f3a2b1c0d';
const PERSON = '0e1d2c3b-4a59-4687-a5b4-c3d2e1f0a9b8';

const request = {
    account: {
        user: { type: 'registered', id: 'user-1', userUuid: 'user-1' },
        organization: {
            organizationUuid: 'org-1',
            name: 'Org',
            createdAt: new Date('2024-01-01'),
        },
        authentication: { type: 'session' },
    },
} as unknown as Request;

const buildController = (service: Record<string, unknown>) =>
    new OrgDepartmentsController({
        getDepartmentService: () => service,
    } as unknown as ServiceRepository);

describe('OrgDepartmentsController source', () => {
    const source = readFileSync(
        join(__dirname, 'OrgDepartmentsController.ts'),
        'utf8',
    );
    it('never accepts an organization identifier in any route', () => {
        expect(source).not.toMatch(/organizationUuid/i);
        expect(source).not.toMatch(/organizationUuidOrSlug|orgUuid|orgId/);
    });
    it('takes only department and user uuids as path parameters', () => {
        const paths = Array.from(
            source.matchAll(/@(?:Get|Post|Put|Patch|Delete)\('([^']*)'\)/g),
            ([, path]) => path,
        );
        const params = paths.flatMap((path) =>
            Array.from(path.matchAll(/\{(\w+)\}/g), ([, param]) => param),
        );
        expect(paths).toContain('/people/{userUuid}/primary');
        expect(paths).toContain('/{departmentUuid}/overlaps');
        expect(new Set(params)).toEqual(
            new Set(['departmentUuid', 'userUuid']),
        );
    });
    it('is mounted under /api/v1/org/departments', () => {
        expect(source).toContain("@Route('/api/v1/org/departments')");
    });
    it('declares the static membership route before any parameterised GET', () => {
        const membership = source.indexOf("@Get('/membership')");
        const parameterised = source.indexOf("@Get('/{departmentUuid}");
        expect(membership).toBeGreaterThan(-1);
        expect(parameterised === -1 || membership < parameterised).toBe(true);
    });
});

describe('OrgDepartmentsController authentication', () => {
    // Every method on the controller except the service lookup is a route
    const routes = Object.getOwnPropertyNames(
        OrgDepartmentsController.prototype,
    ).filter((name) => name !== 'constructor' && name !== 'departmentService');

    it('has one method for each route the source declares', () => {
        const source = readFileSync(
            join(__dirname, 'OrgDepartmentsController.ts'),
            'utf8',
        );
        const declared = source.match(/@(Get|Post|Put|Patch|Delete)\(/g) ?? [];
        expect(declared.length).toBeGreaterThan(0);
        expect(routes).toHaveLength(declared.length);
    });

    it.each(routes)(
        '%s accepts an API key or a session and requires authentication',
        (route) => {
            expect(
                fetchMiddlewares(
                    Reflect.get(OrgDepartmentsController.prototype, route),
                ),
            ).toEqual([[allowApiKeyAuthentication, isAuthenticated]]);
        },
    );
});

describe('OrgDepartmentsController', () => {
    it('returns 404 when the EE service is not registered', async () => {
        const controller = new OrgDepartmentsController({
            getDepartmentService: () => {
                throw new MissingConfigError('no provider');
            },
        } as unknown as ServiceRepository);
        await expect(controller.getSummary(request)).rejects.toThrow(
            NotFoundError,
        );
    });
    it('rethrows errors that are not a missing service', async () => {
        const controller = new OrgDepartmentsController({
            getDepartmentService: () => {
                throw new Error('boom');
            },
        } as unknown as ServiceRepository);
        await expect(controller.getSummary(request)).rejects.toThrow('boom');
    });
    it('passes owners through to the service with the session account', async () => {
        const setOwners = vi.fn().mockResolvedValue({ departmentUuid: 'd' });
        const controller = buildController({ setOwners });
        const owners = [{ type: 'group' as const, uuid: 'g-1' }];
        const response = await controller.setOwners(request, 'd', { owners });
        expect(setOwners).toHaveBeenCalledWith(request.account, 'd', owners);
        expect(response).toEqual({
            status: 'ok',
            results: { departmentUuid: 'd' },
        });
    });
    it('returns the department detail from the service', async () => {
        const getDetail = vi.fn().mockResolvedValue({ members: [] });
        const controller = buildController({ getDetail });
        const response = await controller.getDetail(request, 'd');
        expect(getDetail).toHaveBeenCalledWith(request.account, 'd');
        expect(response).toEqual({ status: 'ok', results: { members: [] } });
    });
    it('responds 201 on create', async () => {
        const create = vi.fn().mockResolvedValue({ departmentUuid: 'd' });
        const controller = buildController({ create });
        await controller.create(request, {
            name: 'Finance',
            parentDepartmentUuid: null,
            headcount: null,
            headcountNote: null,
            targetActiveUsers: null,
            targetDate: null,
        });
        expect(controller.getStatus()).toBe(201);
    });
    it.each([
        ['sets', MARKETING.toUpperCase(), MARKETING],
        ['clears', null, null],
    ])(
        '%s a primary department with lower-cased uuids and no results',
        async (_action, departmentUuid, expected) => {
            const setPrimaryDepartment = vi.fn().mockResolvedValue(undefined);
            const controller = buildController({ setPrimaryDepartment });
            const response = await controller.setPrimaryDepartment(
                request,
                PERSON.toUpperCase(),
                { departmentUuid },
            );
            expect(setPrimaryDepartment).toHaveBeenCalledWith(
                request.account,
                PERSON,
                { departmentUuid: expected },
            );
            expect(controller.getStatus()).toBe(200);
            expect(response).toEqual({ status: 'ok', results: undefined });
        },
    );
    it.each([
        ['a malformed person', 'not-a-uuid', { departmentUuid: MARKETING }],
        ['a malformed department', PERSON, { departmentUuid: 'not-a-uuid' }],
        ['a missing department', PERSON, {}],
    ])(
        'refuses %s on the primary department before the service runs',
        async (_case, userUuid, body) => {
            const setPrimaryDepartment = vi.fn();
            const controller = buildController({ setPrimaryDepartment });
            await expect(
                controller.setPrimaryDepartment(
                    request,
                    userUuid,
                    body as SetPrimaryDepartment,
                ),
            ).rejects.toThrow(ParameterError);
            expect(setPrimaryDepartment).not.toHaveBeenCalled();
        },
    );
    it('passes the service errors on the primary department through unchanged', async () => {
        const notFound = new NotFoundError('not an active member');
        const invalid = new ParameterError('not in that department');
        const setPrimaryDepartment = vi
            .fn()
            .mockRejectedValueOnce(notFound)
            .mockRejectedValueOnce(invalid);
        const controller = buildController({ setPrimaryDepartment });
        const setPrimary = () =>
            controller.setPrimaryDepartment(request, PERSON, {
                departmentUuid: MARKETING,
            });
        await expect(setPrimary()).rejects.toBe(notFound);
        await expect(setPrimary()).rejects.toBe(invalid);
    });
    it.each([
        {
            name: 'with neither list',
            withValue: undefined,
            withoutValue: undefined,
            withUuids: undefined,
            withoutUuids: undefined,
        },
        {
            name: 'with two departments to compare with',
            withValue: `${MARKETING.toUpperCase()},${SALES}`,
            withoutValue: undefined,
            withUuids: [MARKETING, SALES],
            withoutUuids: undefined,
        },
        {
            name: 'with two departments to leave out',
            withValue: undefined,
            withoutValue: `${SALES},${FINANCE.toUpperCase()}`,
            withUuids: undefined,
            withoutUuids: [SALES, FINANCE],
        },
        {
            name: 'with an empty with, read as left out',
            withValue: '',
            withoutValue: SALES,
            withUuids: undefined,
            withoutUuids: [SALES],
        },
        {
            name: 'with an empty without, read as left out',
            withValue: MARKETING,
            withoutValue: '',
            withUuids: [MARKETING],
            withoutUuids: undefined,
        },
    ])(
        'reads overlaps $name',
        async ({ withValue, withoutValue, withUuids, withoutUuids }) => {
            const getOverlaps = vi.fn().mockResolvedValue({ overlaps: [] });
            const controller = buildController({ getOverlaps });
            const response = await controller.getOverlaps(
                request,
                DEPARTMENT.toUpperCase(),
                withValue,
                withoutValue,
            );
            expect(getOverlaps).toHaveBeenCalledWith(
                request.account,
                DEPARTMENT,
                withUuids,
                withoutUuids,
            );
            expect(controller.getStatus()).toBe(200);
            expect(response).toEqual({
                status: 'ok',
                results: { overlaps: [] },
            });
        },
    );
    it.each([
        {
            name: 'a malformed department',
            departmentUuid: 'not-a-uuid',
            withValue: undefined,
            withoutValue: undefined,
        },
        {
            name: 'three departments to compare with',
            departmentUuid: DEPARTMENT,
            withValue: `${MARKETING},${SALES},${FINANCE}`,
            withoutValue: undefined,
        },
        {
            name: 'three departments to leave out',
            departmentUuid: DEPARTMENT,
            withValue: undefined,
            withoutValue: `${MARKETING},${SALES},${FINANCE}`,
        },
        {
            name: 'a malformed uuid to compare with',
            departmentUuid: DEPARTMENT,
            withValue: `${MARKETING},not-a-uuid`,
            withoutValue: undefined,
        },
        {
            name: 'a malformed uuid to leave out',
            departmentUuid: DEPARTMENT,
            withValue: undefined,
            withoutValue: 'not-a-uuid',
        },
        {
            name: 'an empty entry',
            departmentUuid: DEPARTMENT,
            withValue: `${MARKETING},`,
            withoutValue: undefined,
        },
        {
            name: 'the department itself to compare with',
            departmentUuid: DEPARTMENT,
            withValue: DEPARTMENT.toUpperCase(),
            withoutValue: undefined,
        },
        {
            name: 'the department itself to leave out',
            departmentUuid: DEPARTMENT,
            withValue: undefined,
            withoutValue: `${MARKETING},${DEPARTMENT}`,
        },
    ])(
        'refuses $name on overlaps before the service runs',
        async ({ departmentUuid, withValue, withoutValue }) => {
            const getOverlaps = vi.fn();
            const controller = buildController({ getOverlaps });
            await expect(
                controller.getOverlaps(
                    request,
                    departmentUuid,
                    withValue,
                    withoutValue,
                ),
            ).rejects.toThrow(ParameterError);
            expect(getOverlaps).not.toHaveBeenCalled();
        },
    );
    it('passes the service errors on overlaps through unchanged', async () => {
        const notFound = new NotFoundError('department not found');
        const invalid = new ParameterError('not in this organization');
        const getOverlaps = vi
            .fn()
            .mockRejectedValueOnce(notFound)
            .mockRejectedValueOnce(invalid);
        const controller = buildController({ getOverlaps });
        const readOverlaps = () =>
            controller.getOverlaps(request, DEPARTMENT, MARKETING, undefined);
        await expect(readOverlaps()).rejects.toBe(notFound);
        await expect(readOverlaps()).rejects.toBe(invalid);
    });
});
