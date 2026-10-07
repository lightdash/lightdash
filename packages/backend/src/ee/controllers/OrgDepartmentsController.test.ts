import { MissingConfigError, NotFoundError } from '@lightdash/common';
import { type Request } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { type ServiceRepository } from '../../services/ServiceRepository';
import { OrgDepartmentsController } from './OrgDepartmentsController';

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
});
