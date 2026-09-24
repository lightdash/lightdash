import { DEFAULT_DATA_APP_VIZ_LIST_SORT } from '@lightdash/common';
import { type Request } from 'express';
import { type ServiceRepository } from '../../services/ServiceRepository';
import { EmbedController } from './embedController';

describe('EmbedController project chart type pagination', () => {
    it.each([
        {
            page: undefined,
            pageSize: undefined,
            expected: { page: 1, pageSize: 25 },
        },
        { page: 2, pageSize: undefined, expected: { page: 2, pageSize: 25 } },
        { page: undefined, pageSize: 10, expected: { page: 1, pageSize: 10 } },
        { page: 3, pageSize: 5, expected: { page: 3, pageSize: 5 } },
    ])(
        'paginates with page=$page and pageSize=$pageSize',
        async ({ page, pageSize, expected }) => {
            const listEmbedProjectDataAppVisualizations = vi
                .fn()
                .mockResolvedValue({ data: [] });
            const controller = new EmbedController({
                getEmbedService: () => ({
                    listEmbedProjectDataAppVisualizations,
                }),
            } as unknown as ServiceRepository);
            const request = {
                account: {
                    authentication: { type: 'jwt', source: 'embed-token' },
                    user: { type: 'anonymous' },
                },
            } as unknown as Request;

            await controller.listEmbedProjectDataAppVisualizations(
                request,
                '3675b69e-8324-4110-bdca-059031aa8da3',
                page,
                pageSize,
            );

            expect(listEmbedProjectDataAppVisualizations).toHaveBeenCalledWith(
                request.account,
                '3675b69e-8324-4110-bdca-059031aa8da3',
                expected,
                undefined,
                DEFAULT_DATA_APP_VIZ_LIST_SORT,
            );
        },
    );
});
