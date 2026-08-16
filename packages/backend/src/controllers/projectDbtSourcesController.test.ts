import type express from 'express';
import { buildAccount } from '../auth/account/account.mock';
import { ProjectDbtSourcesController } from './projectDbtSourcesController';

describe('ProjectDbtSourcesController source name validation', () => {
    const createProjectDbtSource = vi.fn();
    const updateProjectDbtSource = vi.fn();
    const controller = new ProjectDbtSourcesController({
        getProjectDbtSourcesService: () => ({
            createProjectDbtSource,
            updateProjectDbtSource,
        }),
    } as never);
    const request = {
        account: buildAccount(),
    } as express.Request;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each([
        [
            'my source!',
            'Names must contain only letters, numbers, and underscores.',
        ],
        ['a'.repeat(300), 'Names must be 64 characters or fewer.'],
        [
            'sales__orders',
            'source names become part of qualified explore names and "__" is the separator.',
        ],
    ])(
        'rejects invalid source name %s on create before calling the service',
        async (name, message) => {
            await expect(
                controller.createProjectDbtSource(
                    '11111111-1111-4111-8111-111111111111',
                    { name, dbtConnection: {} as never },
                    request,
                ),
            ).rejects.toThrow(message);

            expect(createProjectDbtSource).not.toHaveBeenCalled();
        },
    );

    it.each([
        [
            'my source!',
            'Names must contain only letters, numbers, and underscores.',
        ],
        ['a'.repeat(300), 'Names must be 64 characters or fewer.'],
        [
            'sales__orders',
            'source names become part of qualified explore names and "__" is the separator.',
        ],
    ])(
        'rejects invalid source name %s on update before calling the service',
        async (name, message) => {
            await expect(
                controller.updateProjectDbtSource(
                    '11111111-1111-4111-8111-111111111111',
                    '22222222-2222-4222-8222-222222222222',
                    { name },
                    request,
                ),
            ).rejects.toThrow(message);

            expect(updateProjectDbtSource).not.toHaveBeenCalled();
        },
    );
});
