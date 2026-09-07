import { ProjectType, type OrganizationProject } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { isPlaygroundProject, splitSwitcherProjects } from './switcherProjects';

const project = (
    overrides: Partial<OrganizationProject> & { projectUuid: string },
): OrganizationProject =>
    ({
        name: overrides.projectUuid,
        type: ProjectType.DEFAULT,
        createdByUserUuid: null,
        upstreamProjectUuid: null,
        warehouseType: null,
        requireUserCredentials: false,
        expiresAt: null,
        ...overrides,
    }) as OrganizationProject;

describe('project switcher grouping', () => {
    const real = project({ projectUuid: 'real' });
    const training = project({
        projectUuid: 'training',
        type: ProjectType.TRAINING,
    });
    const preview = project({
        projectUuid: 'preview',
        type: ProjectType.PREVIEW,
        upstreamProjectUuid: 'real',
    });
    const copy = project({
        projectUuid: 'copy',
        type: ProjectType.PREVIEW,
        upstreamProjectUuid: 'training',
    });

    it('lists the training playground beside the real projects', () => {
        const { baseProjects } = splitSwitcherProjects(
            [preview, training, real, copy],
            () => true,
        );
        expect(baseProjects.map((p) => p.projectUuid)).toEqual([
            'training',
            'real',
        ]);
    });

    it('hangs previews and learner copies off their upstream project', () => {
        const { previewsByUpstream } = splitSwitcherProjects(
            [real, training, preview, copy],
            () => true,
        );
        expect(previewsByUpstream.get('real')).toEqual([preview]);
        expect(previewsByUpstream.get('training')).toEqual([copy]);
    });

    it('drops previews the caller may not see', () => {
        const { previewsByUpstream } = splitSwitcherProjects(
            [real, preview],
            () => false,
        );
        expect(previewsByUpstream.size).toBe(0);
    });

    it('marks only the training project as the playground', () => {
        expect(isPlaygroundProject(training)).toBe(true);
        expect(isPlaygroundProject(real)).toBe(false);
        expect(isPlaygroundProject(copy)).toBe(false);
    });
});
