import { Ability } from '@casl/ability';
import {
    ConflictError,
    FeatureFlags,
    ProjectType,
    type PossibleAbilities,
    type Project,
} from '@lightdash/common';
import { getPeerDbtSourcesEnabled } from '../../utils/peerDbtSourcesOperation';
import { ProjectService } from './ProjectService';
import { projectWithSensitiveFields, user } from './ProjectService.mock';

const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
};

const setup = (
    enabled: boolean,
    root: Project = projectWithSensitiveFields,
) => {
    const events: string[] = [];
    const copies = ['synthetic-copy-a', 'synthetic-copy-b'].map(
        (projectUuid) => ({
            projectUuid,
            type: ProjectType.PREVIEW,
            provisioningSource: 'training',
            upstreamProjectUuid: root.projectUuid,
            createdByUserUuid: user.userUuid,
        }),
    );
    const projectModel = {
        getWithSensitiveFields: vi.fn(async () => root),
        get: vi.fn(async () => root),
        getAllByOrganizationUuid: vi.fn(async () => copies),
        getExpiredPreviewProjects: vi.fn(async () =>
            copies.map((copy) => ({
                projectUuid: copy.projectUuid,
                organizationUuid: root.organizationUuid,
            })),
        ),
        beginDeletion: vi.fn(async (group: string[]) => {
            expect(getPeerDbtSourcesEnabled()).toBe(true);
            events.push(`begin:${group.join(',')}`);
        }),
        deleteContentInBatches: vi.fn(async (projectUuid: string) => {
            events.push(`content:${projectUuid}`);
        }),
        delete: vi.fn(async (projectUuid: string) => {
            events.push(`delete:${projectUuid}`);
        }),
        deleteAfterContentCleanup: vi.fn(
            async (
                projectUuid: string,
                _transaction: unknown,
                _group: string[],
            ) => {
                expect(getPeerDbtSourcesEnabled()).toBe(true);
                events.push(`final:${projectUuid}`);
            },
        ),
    };
    const transaction = {};
    const onboardingModel = {
        runInPlaygroundProvisioningLock: vi.fn(
            async (
                _organizationUuid: string,
                callback: (trx: object) => Promise<void>,
            ) => {
                events.push('playground-lock');
                await callback(transaction);
            },
        ),
        getByOrganizationUuid: vi.fn(async () => {
            events.push('onboarding-read');
        }),
        update: vi.fn(async () => {
            events.push('onboarding-update');
        }),
    };
    const get = vi.fn(async ({ featureFlagId }: { featureFlagId: string }) => ({
        id: featureFlagId,
        enabled: featureFlagId === FeatureFlags.EnableLearn || enabled,
    }));
    const deleteProjectAppFiles = vi.fn(async (projectUuid: string) => {
        events.push(`bucket:${projectUuid}`);
    });
    const service = Object.assign(
        Object.create(ProjectService.prototype) as ProjectService,
        {
            projectModel,
            onboardingModel,
            featureFlagModel: { get },
            analytics: { track: vi.fn() },
            userModel: { invalidateSessionUserCache: vi.fn() },
            getAppGenerateService: () => ({ deleteProjectAppFiles }),
            logger: {
                debug: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            },
        },
    );
    const deletingUser = {
        ...user,
        organizationUuid: root.organizationUuid,
        organizationName: 'Synthetic organization',
        organizationCreatedAt: new Date(),
        ability: new Ability<PossibleAbilities>([
            { subject: 'Project', action: 'delete' },
            { subject: 'Organization', action: 'manage' },
            { subject: 'Learn', action: 'view' },
        ]),
    };
    return {
        service,
        projectModel,
        onboardingModel,
        get,
        deleteProjectAppFiles,
        events,
        transaction,
        deletingUser,
        copies,
    };
};

describe('ProjectService deletion operations', () => {
    test.each(['regular', 'playground', 'training'] as const)(
        'keeps the legacy %s deletion call order when disabled',
        async (kind) => {
            const root = {
                ...projectWithSensitiveFields,
                type:
                    kind === 'training'
                        ? ProjectType.TRAINING
                        : ProjectType.DEFAULT,
                provisioningSource: kind === 'playground' ? 'playground' : null,
            };
            const fixture = setup(false, root);
            await fixture.service.delete(
                root.projectUuid,
                fixture.deletingUser,
            );
            expect(fixture.projectModel.beginDeletion).not.toHaveBeenCalled();
            expect(
                fixture.projectModel.deleteAfterContentCleanup,
            ).not.toHaveBeenCalled();
            if (kind === 'playground') {
                expect(fixture.events).toEqual([
                    `content:${root.projectUuid}`,
                    'playground-lock',
                    'onboarding-read',
                    'onboarding-update',
                    `delete:${root.projectUuid}`,
                ]);
                expect(fixture.projectModel.delete).toHaveBeenCalledWith(
                    root.projectUuid,
                    fixture.transaction,
                );
            } else if (kind === 'training') {
                expect(fixture.events).toEqual([
                    'bucket:synthetic-copy-a',
                    'bucket:synthetic-copy-b',
                    'delete:synthetic-copy-a',
                    'delete:synthetic-copy-b',
                    `delete:${root.projectUuid}`,
                ]);
            } else {
                expect(fixture.events).toEqual([`delete:${root.projectUuid}`]);
            }
            expect(fixture.get).toHaveBeenCalledOnce();
        },
    );

    test('marks the complete training group before bucket cleanup and freezes the flag through each final deletion', async () => {
        const root = {
            ...projectWithSensitiveFields,
            type: ProjectType.TRAINING,
        };
        const fixture = setup(true, root);
        fixture.get.mockResolvedValueOnce({
            id: FeatureFlags.PeerDbtSources,
            enabled: true,
        });
        fixture.get.mockResolvedValue({
            id: FeatureFlags.PeerDbtSources,
            enabled: false,
        });
        await fixture.service.delete(root.projectUuid, fixture.deletingUser);
        const group = [
            root.projectUuid,
            ...fixture.copies.map((p) => p.projectUuid),
        ];
        expect(
            fixture.projectModel.beginDeletion,
        ).toHaveBeenCalledExactlyOnceWith(group);
        expect(fixture.events[0]).toBe(`begin:${group.join(',')}`);
        fixture.copies.forEach(({ projectUuid }) => {
            expect(
                fixture.projectModel.deleteAfterContentCleanup,
            ).toHaveBeenCalledWith(projectUuid, undefined, group);
        });
        expect(
            fixture.projectModel.deleteAfterContentCleanup,
        ).toHaveBeenLastCalledWith(root.projectUuid, undefined, group);
        expect(fixture.get).toHaveBeenCalledOnce();
        expect(fixture.projectModel.delete).not.toHaveBeenCalled();
    });

    test('does not enter the playground advisory transaction until content cleanup finishes', async () => {
        const root = {
            ...projectWithSensitiveFields,
            provisioningSource: 'playground',
        };
        const fixture = setup(true, root);
        const entered = deferred();
        const release = deferred();
        fixture.projectModel.deleteContentInBatches.mockImplementation(
            async () => {
                entered.resolve();
                await release.promise;
            },
        );
        const deletion = fixture.service.delete(
            root.projectUuid,
            fixture.deletingUser,
        );
        try {
            await entered.promise;
            expect(fixture.projectModel.beginDeletion).toHaveBeenCalledWith([
                root.projectUuid,
            ]);
            expect(
                fixture.onboardingModel.runInPlaygroundProvisioningLock,
            ).not.toHaveBeenCalled();
        } finally {
            release.resolve();
            await deletion;
        }
        expect(fixture.projectModel.delete).toHaveBeenCalledExactlyOnceWith(
            root.projectUuid,
            fixture.transaction,
            [root.projectUuid],
        );
        expect(fixture.get).toHaveBeenCalledOnce();
    });

    test('starts expired previews independently and lets both bucket operations overlap', async () => {
        const fixture = setup(true);
        const release = deferred();
        fixture.deleteProjectAppFiles.mockImplementation(
            async () => release.promise,
        );
        const deletion = fixture.service.deleteExpiredPreviewProjects();
        try {
            await vi.waitFor(() =>
                expect(fixture.deleteProjectAppFiles).toHaveBeenCalledTimes(2),
            );
            expect(fixture.projectModel.beginDeletion.mock.calls).toEqual([
                [['synthetic-copy-a']],
                [['synthetic-copy-b']],
            ]);
            expect(
                fixture.projectModel.deleteAfterContentCleanup,
            ).not.toHaveBeenCalled();
        } finally {
            release.resolve();
        }
        await expect(deletion).resolves.toBe(2);
        expect(
            fixture.projectModel.deleteAfterContentCleanup.mock.calls,
        ).toEqual([
            ['synthetic-copy-a', undefined, ['synthetic-copy-a']],
            ['synthetic-copy-b', undefined, ['synthetic-copy-b']],
        ]);
    });

    test('prechecks the complete learner deletion group before removing any bucket files', async () => {
        const root = {
            ...projectWithSensitiveFields,
            type: ProjectType.TRAINING,
        };
        const fixture = setup(true, root);
        fixture.projectModel.beginDeletion.mockRejectedValueOnce(
            new ConflictError('Synthetic external consumer'),
        );
        await expect(
            fixture.service.deleteTrainingPreviews(
                fixture.deletingUser,
                root.projectUuid,
            ),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(
            fixture.projectModel.beginDeletion,
        ).toHaveBeenCalledExactlyOnceWith(
            fixture.copies.map((copy) => copy.projectUuid),
        );
        expect(fixture.deleteProjectAppFiles).not.toHaveBeenCalled();
        expect(
            fixture.projectModel.deleteContentInBatches,
        ).not.toHaveBeenCalled();
    });
});
