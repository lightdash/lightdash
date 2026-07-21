import { ParameterError } from '@lightdash/common';
import { type Request } from 'express';
import { type ServiceRepository } from '../../services/ServiceRepository';
import { type ProjectHomepageService } from '../services/ProjectHomepageService';
import { ProjectAnnouncementsController } from './projectAnnouncementsController';

type UploadImage = ProjectHomepageService['uploadAnnouncementImage'];

describe('ProjectAnnouncementsController — uploadImage', () => {
    const buildController = (
        uploadAnnouncementImage: UploadImage = vi
            .fn()
            .mockResolvedValue({
                url: 'https://app.lightdash.com/api/v1/file/abc',
            }),
    ) => {
        const service: Pick<ProjectHomepageService, 'uploadAnnouncementImage'> =
            { uploadAnnouncementImage };
        // ServiceRepository.getProjectHomepageService is generic, so a precise
        // partial can't satisfy it — cast the stub once at the boundary.
        const services = {
            getProjectHomepageService: () => service,
        } as unknown as ServiceRepository;
        const controller = new ProjectAnnouncementsController(services);
        return { controller, uploadAnnouncementImage };
    };

    const buildRequest = (
        headers: Record<string, string | undefined>,
    ): Request =>
        ({
            account: {
                user: { type: 'registered', id: 'user-1' },
                organization: {
                    organizationUuid: 'org-1',
                    name: 'Org',
                    createdAt: new Date('2024-01-01'),
                },
                authentication: { type: 'session' },
            },
            headers: {
                'content-type': 'image/png',
                'content-length': '10',
                ...headers,
            },
        }) as unknown as Request;

    it('throws a ParameterError when Content-Type is missing', async () => {
        const { controller } = buildController();
        await expect(
            controller.uploadImage(
                buildRequest({ 'content-type': undefined }),
                'project-1',
            ),
        ).rejects.toThrow(ParameterError);
    });

    it('throws a ParameterError when Content-Length is missing or invalid', async () => {
        const { controller } = buildController();
        await expect(
            controller.uploadImage(
                buildRequest({ 'content-length': 'not-a-number' }),
                'project-1',
            ),
        ).rejects.toThrow(ParameterError);
    });

    it('delegates to the homepage service and returns its result', async () => {
        const { controller, uploadAnnouncementImage } = buildController();
        const req = buildRequest({});

        const result = await controller.uploadImage(req, 'project-1');

        expect(uploadAnnouncementImage).toHaveBeenCalledWith(
            expect.anything(),
            'project-1',
            'image/png',
            req,
            10,
        );
        expect(result).toEqual({
            status: 'ok',
            results: { url: 'https://app.lightdash.com/api/v1/file/abc' },
        });
    });
});
