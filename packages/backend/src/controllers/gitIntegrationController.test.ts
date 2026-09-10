import { FeatureFlags } from '@lightdash/common';
import type express from 'express';
import { fromSession } from '../auth/account';
import { user } from '../services/ProjectService/ProjectService.mock';
import type { ServiceRepository } from '../services/ServiceRepository';
import { GitIntegrationController } from './gitIntegrationController';

vi.mock('../config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('../config/lightdashConfig.mock');
    return {
        lightdashConfig: {
            ...lightdashConfigMock,
            editYamlInUi: { enabled: false },
        },
    };
});

it.each([false, true])(
    'uses the resolved source editor flag for explore links: enabled=%s',
    async (enabled) => {
        const get = vi
            .fn()
            .mockResolvedValue({ id: FeatureFlags.EditYamlInUi, enabled });
        const getFilePathForExplore = vi
            .fn()
            .mockResolvedValue({ filePath: 'models/nested/orders.yaml' });
        const controller = new GitIntegrationController({
            getFeatureFlagService: () => ({ get }),
            getGitIntegrationService: () => ({ getFilePathForExplore }),
        } as unknown as ServiceRepository);
        const request = {
            account: fromSession(
                { ...user, organizationUuid: 'organizationUuid' },
                'session-cookie',
            ),
        } as express.Request;
        const result = controller.getFilePathForExplore(
            'projectUuid',
            'orders',
            request,
        );
        if (enabled) {
            await expect(result).resolves.toMatchObject({
                results: { filePath: 'models/nested/orders.yaml' },
            });
            expect(getFilePathForExplore).toHaveBeenCalledWith(
                expect.objectContaining({ userUuid: user.userUuid }),
                'projectUuid',
                'orders',
            );
        } else {
            await expect(result).rejects.toThrow(
                'Edit YAML in UI feature is not enabled',
            );
            expect(getFilePathForExplore).not.toHaveBeenCalled();
        }
    },
);
