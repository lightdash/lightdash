import { detectSubjectType, subject } from '@casl/ability';
import {
    ForbiddenError,
    GoogleNotConnectedError,
    NotFoundError,
    ParameterError,
} from '@lightdash/common';
import { GdriveService } from './GdriveService';

describe('GdriveService.scheduleUploadGsheetFromRows', () => {
    const projectUuid = 'proj-1';
    const organizationUuid = 'org-1';

    const mkAccount = (userUuid: string) => ({
        user: {
            id: userUuid,
            userUuid,
            ability: { can: () => true, cannot: () => false },
        },
        organization: { organizationUuid },
    });

    const baseOptions = {
        projectUuid,
        title: 'My Export',
        columns: [{ key: 'a', label: 'A', type: 'string' as const }],
        rows: [{ a: 'hello' }],
    };

    function makeService(
        overrides: Partial<{
            ability: { can: jest.Mock; cannot: jest.Mock };
            refreshTokenThrows: boolean;
        }> = {},
    ) {
        const projectModel = {
            getSummary: jest.fn().mockResolvedValue({
                projectUuid,
                organizationUuid,
                name: 'Proj',
            }),
        };
        const projectService = {
            getProject: jest.fn().mockResolvedValue({ organizationUuid }),
        };
        const userModel = {
            getRefreshToken: overrides.refreshTokenThrows
                ? jest
                      .fn()
                      .mockRejectedValue(
                          new NotFoundError('Cannot find refresh token'),
                      )
                : jest.fn().mockResolvedValue('rt'),
        };
        const schedulerClient = {
            uploadGsheetFromRowsJob: jest
                .fn()
                .mockResolvedValue({ jobId: 'job-1' }),
        };

        const service = new GdriveService({
            lightdashConfig: {} as never,
            projectService: projectService as never,
            savedChartModel: {} as never,
            dashboardModel: {} as never,
            userModel: userModel as never,
            schedulerClient: schedulerClient as never,
            projectModel: projectModel as never,
        });

        const ability = overrides.ability ?? {
            can: jest.fn(() => true),
            cannot: jest.fn(() => false),
        };
        (
            service as unknown as {
                createAuditedAbility: () => unknown;
            }
        ).createAuditedAbility = () => ability;

        return { service, schedulerClient, userModel, ability };
    }

    it('enqueues a rows job and returns the jobId', async () => {
        const { service, schedulerClient } = makeService();
        const result = await service.scheduleUploadGsheetFromRows(
            mkAccount('u-1') as never,
            baseOptions,
        );
        expect(result).toEqual({ jobId: 'job-1' });
        expect(schedulerClient.uploadGsheetFromRowsJob).toHaveBeenCalledWith(
            expect.objectContaining({
                source: 'rows',
                projectUuid,
                userUuid: 'u-1',
                organizationUuid,
                title: 'My Export',
                rows: baseOptions.rows,
            }),
        );
    });

    it('throws ForbiddenError when GoogleSheets ability is denied', async () => {
        const ability = {
            can: jest.fn(() => true),
            cannot: jest.fn(
                (
                    _action: string,
                    sub: Parameters<typeof detectSubjectType>[0],
                ) => detectSubjectType(sub) === 'GoogleSheets',
            ),
        };
        const { service } = makeService({ ability });
        await expect(
            service.scheduleUploadGsheetFromRows(
                mkAccount('u-1') as never,
                baseOptions,
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('throws GoogleNotConnectedError when refresh token is missing', async () => {
        const { service } = makeService({ refreshTokenThrows: true });
        await expect(
            service.scheduleUploadGsheetFromRows(
                mkAccount('u-1') as never,
                baseOptions,
            ),
        ).rejects.toBeInstanceOf(GoogleNotConnectedError);
    });

    it('throws ParameterError when rows exceed the cap', async () => {
        const { service } = makeService();
        const bigOpts = {
            ...baseOptions,
            rows: Array.from({ length: 100_001 }, (_, i) => ({ a: `r${i}` })),
        };
        await expect(
            service.scheduleUploadGsheetFromRows(
                mkAccount('u-1') as never,
                bigOpts,
            ),
        ).rejects.toBeInstanceOf(ParameterError);
    });
});
