import { LightdashError } from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/analytics';
import GlobalState from '../../globalState';
import {
    downloadCustomRoles,
    uploadCustomRoles,
    type CustomRoleUploadSummary,
} from './customRoles';
import {
    countDependencySkippedGroups,
    downloadGroups,
    uploadGroups,
    type GroupUploadSummary,
} from './groups';
import {
    downloadOrganizationContent,
    uploadOrganizationContent,
} from './index';
import {
    downloadThemes,
    prepareThemeUploads,
    uploadThemes,
    type ThemeUploadSummary,
} from './themes';
import { downloadUsers, uploadUsers, type UserUploadSummary } from './users';

vi.mock('./customRoles', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./customRoles')>()),
    downloadCustomRoles: vi.fn(),
    uploadCustomRoles: vi.fn(),
}));
vi.mock('./users', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./users')>()),
    downloadUsers: vi.fn(),
    uploadUsers: vi.fn(),
}));
vi.mock('./groups', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./groups')>()),
    downloadGroups: vi.fn(),
    uploadGroups: vi.fn(),
    countDependencySkippedGroups: vi.fn(),
}));
vi.mock('./themes', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./themes')>()),
    downloadThemes: vi.fn(),
    prepareThemeUploads: vi.fn(),
    uploadThemes: vi.fn(),
}));

describe('organization content download', () => {
    const spinner = {
        start: vi.fn(),
        succeed: vi.fn(),
        warn: vi.fn(),
        stop: vi.fn(),
        fail: vi.fn(),
    };
    const config = {
        user: {
            userUuid: 'user-uuid',
            organizationUuid: 'organization-uuid',
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(GlobalState, 'startSpinner').mockReturnValue(spinner as never);
        vi.spyOn(GlobalState, 'log').mockImplementation(() => undefined);
        vi.spyOn(GlobalState, 'debug').mockImplementation(() => undefined);
        vi.spyOn(LightdashAnalytics, 'track').mockResolvedValue(undefined);
        vi.mocked(downloadCustomRoles).mockResolvedValue(2);
        vi.mocked(downloadUsers).mockResolvedValue(3);
        vi.mocked(downloadGroups).mockResolvedValue(4);
        vi.mocked(downloadThemes).mockResolvedValue(5);
    });

    it('skips groups when the group service is disabled', async () => {
        vi.mocked(downloadGroups).mockRejectedValue(
            new LightdashError({
                message: 'Group service is not enabled',
                name: 'ForbiddenError',
                statusCode: 403,
                data: {},
            }),
        );

        await expect(
            downloadOrganizationContent({ config }),
        ).resolves.toBeUndefined();

        expect(spinner.warn).toHaveBeenCalledOnce();
        expect(spinner.fail).not.toHaveBeenCalled();
        expect(GlobalState.debug).toHaveBeenCalledWith(
            '> Warning: groups were not downloaded because the group service is not enabled',
        );
    });

    it('reports a duration for every downloaded resource', async () => {
        await downloadOrganizationContent({ config });

        expect(spinner.succeed).toHaveBeenCalledTimes(4);
        spinner.succeed.mock.calls.forEach(([message]) =>
            expect(message).toMatch(/\(\d+ms\)$/),
        );
    });

    it('still fails for other group download errors', async () => {
        vi.mocked(downloadGroups).mockRejectedValue(new Error('Network error'));

        await expect(downloadOrganizationContent({ config })).rejects.toThrow(
            'Network error',
        );

        expect(spinner.fail).toHaveBeenCalledOnce();
    });
});

describe('organization content upload sequencing', () => {
    const spinner = {
        start: vi.fn(),
        succeed: vi.fn(),
        warn: vi.fn(),
        stop: vi.fn(),
        fail: vi.fn(),
    };
    const config = {
        user: {
            userUuid: 'user-uuid',
            organizationUuid: 'organization-uuid',
        },
    };
    const customRoleSummary = (
        failed: number = 0,
    ): CustomRoleUploadSummary => ({
        created: 0,
        updated: 0,
        unchanged: 0,
        failed,
        failures: failed > 0 ? [{ message: 'role failure' }] : [],
    });
    const userSummary = (failed: number = 0): UserUploadSummary => ({
        created: 0,
        updated: 0,
        unchanged: 0,
        awaitingAuthentication: 0,
        invited: 0,
        skippedAuthenticated: 0,
        skippedDisabled: 0,
        skippedValidInvite: 0,
        failed,
        failures: failed > 0 ? [{ message: 'user failure' }] : [],
    });
    const groupSummary = (failed: number = 0): GroupUploadSummary => ({
        created: 0,
        updated: 0,
        unchanged: 0,
        failed,
        dependencySkipped: 0,
        failures: failed > 0 ? [{ message: 'group failure' }] : [],
    });
    const themeSummary = (failed: number = 0): ThemeUploadSummary => ({
        created: failed > 0 ? 1 : 0,
        updated: 0,
        unchanged: 0,
        failed,
        completedSlugs: failed > 0 ? ['processed-theme'] : [],
        failures: failed > 0 ? [{ message: 'theme failure' }] : [],
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(GlobalState, 'startSpinner').mockReturnValue(spinner as never);
        vi.spyOn(GlobalState, 'log').mockImplementation(() => undefined);
        vi.spyOn(LightdashAnalytics, 'track').mockResolvedValue(undefined);
        vi.mocked(uploadCustomRoles).mockResolvedValue(customRoleSummary());
        vi.mocked(uploadUsers).mockResolvedValue(userSummary());
        vi.mocked(uploadGroups).mockResolvedValue(groupSummary());
        vi.mocked(prepareThemeUploads).mockResolvedValue([]);
        vi.mocked(uploadThemes).mockResolvedValue(themeSummary());
        vi.mocked(countDependencySkippedGroups).mockResolvedValue(2);
    });

    it('preflights themes, then awaits organization resource uploads in order', async () => {
        const phaseOrder: string[] = [];
        vi.mocked(prepareThemeUploads).mockImplementation(async () => {
            phaseOrder.push('themes:preflight:start', 'themes:preflight:end');
            return [];
        });
        vi.mocked(uploadCustomRoles).mockImplementation(async () => {
            phaseOrder.push('roles:start', 'roles:end');
            return customRoleSummary();
        });
        vi.mocked(uploadUsers).mockImplementation(async () => {
            phaseOrder.push('users:start', 'users:end');
            return userSummary();
        });
        vi.mocked(uploadGroups).mockImplementation(async () => {
            phaseOrder.push('groups:start', 'groups:end');
            return groupSummary();
        });
        vi.mocked(uploadThemes).mockImplementation(async () => {
            phaseOrder.push('themes:start', 'themes:end');
            return themeSummary();
        });

        await uploadOrganizationContent({ config });

        expect(phaseOrder).toStrictEqual([
            'themes:preflight:start',
            'themes:preflight:end',
            'roles:start',
            'roles:end',
            'users:start',
            'users:end',
            'groups:start',
            'groups:end',
            'themes:start',
            'themes:end',
        ]);
    });

    it('reports a duration for every uploaded resource', async () => {
        await uploadOrganizationContent({ config });

        expect(spinner.succeed).toHaveBeenCalledTimes(4);
        spinner.succeed.mock.calls.forEach(([message]) =>
            expect(message).toMatch(/\(\d+ms\)$/),
        );
    });

    it('does not start users or groups when custom roles fail', async () => {
        vi.mocked(uploadCustomRoles).mockResolvedValue(customRoleSummary(1));

        await expect(uploadOrganizationContent({ config })).rejects.toThrow(
            'Processed custom roles',
        );

        expect(uploadUsers).not.toHaveBeenCalled();
        expect(uploadGroups).not.toHaveBeenCalled();
        expect(uploadThemes).not.toHaveBeenCalled();
        expect(countDependencySkippedGroups).toHaveBeenCalledOnce();
    });

    it('does not start groups when users fail', async () => {
        vi.mocked(uploadUsers).mockResolvedValue(userSummary(1));

        await expect(uploadOrganizationContent({ config })).rejects.toThrow(
            'Processed users',
        );

        expect(uploadGroups).not.toHaveBeenCalled();
        expect(uploadThemes).not.toHaveBeenCalled();
        expect(countDependencySkippedGroups).toHaveBeenCalledOnce();
    });

    it('does not mutate organization resources when theme preflight fails', async () => {
        vi.mocked(prepareThemeUploads).mockRejectedValue(
            new Error('Invalid theme'),
        );

        await expect(uploadOrganizationContent({ config })).rejects.toThrow(
            'Invalid theme',
        );

        expect(uploadCustomRoles).not.toHaveBeenCalled();
        expect(uploadUsers).not.toHaveBeenCalled();
        expect(uploadGroups).not.toHaveBeenCalled();
        expect(uploadThemes).not.toHaveBeenCalled();
    });

    it('fails after reporting a partial theme upload', async () => {
        vi.mocked(uploadThemes).mockResolvedValue(themeSummary(1));

        await expect(uploadOrganizationContent({ config })).rejects.toThrow(
            'Processed themes: 1 created, 0 updated, 0 unchanged, 1 failed',
        );

        expect(GlobalState.log).toHaveBeenCalledWith(
            expect.stringContaining('processed-theme'),
        );
    });
});
