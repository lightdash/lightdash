import { type Account } from '@lightdash/common';
import { type Request, type Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
    developmentView,
    type DevelopmentView,
} from '../../../services/ProjectService/developmentView';
import { developmentViewMiddleware } from './developmentViewMiddleware';

const account = {
    user: { type: 'registered', userUuid: 'user-uuid' },
    organization: { organizationUuid: 'org-uuid' },
    authentication: { type: 'session' },
} as Account;

const inDevelopmentView = (
    findDevelopmentExplores: () => Promise<Map<string, null> | null>,
): Promise<DevelopmentView> => {
    const req = {
        get: (header: string) =>
            header === 'Lightdash-Development-View' ? 'true' : undefined,
        services: {
            getSemanticStudioService: () => ({ findDevelopmentExplores }),
        } as Request['services'],
    } as Request;
    return new Promise((resolve) => {
        developmentViewMiddleware(req, {} as Response, () =>
            resolve(developmentView.getStore()!),
        );
    });
};

describe('developmentViewMiddleware', () => {
    it('reads the draft once per project for every explore read in a request', async () => {
        const found = new Map([['orders', null]]);
        const findDevelopmentExplores = vi.fn(async () => found);
        const view = await inDevelopmentView(findDevelopmentExplores);
        const reads = await Promise.all([
            view.findExplores(account, 'project'),
            view.findExplores(account, 'project'),
            view.findExplores(account, 'project'),
        ]);
        expect(reads).toEqual([found, found, found]);
        expect(findDevelopmentExplores).toHaveBeenCalledTimes(1);
    });

    it('falls back to live when the draft cannot be read', async () => {
        const view = await inDevelopmentView(async () => {
            throw new Error('rate limited');
        });
        expect(await view.findExplores(account, 'project')).toBeNull();
    });
});
