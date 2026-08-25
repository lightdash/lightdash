import { type AnyType, type SessionUser } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { CoderService } from './CoderService';

const user = {
    userUuid: 'user-uuid',
    ability: {
        can: () => true,
        cannot: () => false,
        relevantRuleFor: () => ({ inverted: false }),
    },
} as unknown as SessionUser;

const stash = {
    contentType: 'chart',
    slug: 'monthly-revenue',
    incomingSnapshot: { name: 'Monthly revenue', slug: 'monthly-revenue' },
    incomingHash: 'incoming-hash',
    rejectedAt: new Date('2026-08-25T09:00:00Z'),
};

const buildService = (
    overrides: {
        stash?: object | undefined;
        base?: object | undefined;
    } = {},
) => {
    const contentAsCodeSnapshotModel = {
        upsert: vi.fn(),
        get: vi.fn().mockResolvedValue(
            'base' in overrides
                ? overrides.base
                : {
                      snapshot: { name: 'Base' },
                      snapshotHash: 'base-hash',
                      appliedAt: new Date('2026-08-24T09:00:00Z'),
                  },
        ),
        getIncomingStash: vi
            .fn()
            .mockResolvedValue('stash' in overrides ? overrides.stash : stash),
        listIncomingStash: vi.fn().mockResolvedValue([stash]),
        clearIncomingStash: vi.fn(),
        stashIncoming: vi.fn(),
    };
    const service = new CoderService({
        analytics: {} as AnyType,
        contentAsCodeSnapshotModel: contentAsCodeSnapshotModel as AnyType,
        contentAsCodeProjectSettingsModel: { upsert: vi.fn() } as AnyType,
        contentVerificationModel: {} as AnyType,
        dashboardModel: {} as AnyType,
        lightdashConfig: {} as AnyType,
        projectModel: {
            get: vi.fn().mockResolvedValue({
                projectUuid: 'project-uuid',
                organizationUuid: 'org-uuid',
            }),
            getSummary: vi.fn().mockResolvedValue({
                organizationUuid: 'org-uuid',
            }),
        } as AnyType,
        promoteService: {} as AnyType,
        savedChartModel: { find: vi.fn() } as AnyType,
        savedSqlModel: { find: vi.fn() } as AnyType,
        appModel: {} as AnyType,
        schedulerModel: {} as AnyType,
        schedulerService: {} as AnyType,
        savedChartService: {} as AnyType,
        dashboardService: {} as AnyType,
        schedulerClient: {} as AnyType,
        spaceModel: {} as AnyType,
        spacePermissionService: {} as AnyType,
        groupsModel: {} as AnyType,
        organizationMemberProfileModel: {} as AnyType,
        userModel: {} as AnyType,
    });
    return { service, contentAsCodeSnapshotModel };
};

describe('CoderService content-as-code conflicts', () => {
    it('lists stashed conflicts', async () => {
        const { service } = buildService();
        const conflicts = await service.listContentAsCodeConflicts(
            user,
            'project-uuid',
        );
        expect(conflicts).toEqual([
            {
                contentType: 'chart',
                slug: 'monthly-revenue',
                incomingHash: 'incoming-hash',
                rejectedAt: stash.rejectedAt,
            },
        ]);
    });

    it('returns the three-way view for a stashed slug', async () => {
        const { service } = buildService();
        vi.spyOn(service, 'getCurrentContentVersionBySlug').mockResolvedValue({
            contentUuid: 'chart-uuid',
            versionUuid: null,
        });
        vi.spyOn(service, 'getCurrentChartAsCode').mockResolvedValue({
            name: 'Current',
            slug: 'monthly-revenue',
        } as AnyType);

        const conflict = await service.getContentAsCodeConflict(
            user,
            'project-uuid',
            'chart',
            'monthly-revenue',
        );
        expect(conflict.base).toEqual({ name: 'Base' });
        expect(conflict.baseHash).toBe('base-hash');
        expect(conflict.current).toEqual({
            name: 'Current',
            slug: 'monthly-revenue',
        });
        expect(conflict.incoming).toEqual(stash.incomingSnapshot);
        expect(conflict.incomingHash).toBe('incoming-hash');
    });

    it('404s when nothing is stashed', async () => {
        const { service } = buildService({ stash: undefined });
        await expect(
            service.getContentAsCodeConflict(
                user,
                'project-uuid',
                'chart',
                'monthly-revenue',
            ),
        ).rejects.toThrow('No skipped upload is stashed');
    });

    it('take_git applies the stashed incoming doc with git-wins semantics', async () => {
        const { service } = buildService();
        const upsertSpy = vi
            .spyOn(service, 'upsertChart')
            .mockResolvedValue({} as AnyType);
        await service.resolveContentAsCodeConflict(
            user,
            'project-uuid',
            'chart',
            'monthly-revenue',
            'take_git',
        );
        expect(upsertSpy).toHaveBeenCalledWith(
            user,
            'project-uuid',
            'monthly-revenue',
            stash.incomingSnapshot,
            { overwriteDrifted: true },
        );
    });

    it('keep_mine clears the stash and applies nothing', async () => {
        const { service, contentAsCodeSnapshotModel } = buildService();
        const upsertSpy = vi
            .spyOn(service, 'upsertChart')
            .mockResolvedValue({} as AnyType);
        await service.resolveContentAsCodeConflict(
            user,
            'project-uuid',
            'chart',
            'monthly-revenue',
            'keep_mine',
        );
        expect(upsertSpy).not.toHaveBeenCalled();
        expect(
            contentAsCodeSnapshotModel.clearIncomingStash,
        ).toHaveBeenCalledWith('project-uuid', 'chart', 'monthly-revenue');
    });
});
