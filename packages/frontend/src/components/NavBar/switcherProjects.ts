import {
    assertUnreachable,
    ProjectType,
    type OrganizationProject,
} from '@lightdash/common';

/**
 * How the project switcher groups an org's projects: the base list is the
 * real projects plus the org's training playground (learners land in the
 * playground and its copies, and the switcher is how they get back), and
 * previews hang off their upstream project when the caller may see them.
 */
export const splitSwitcherProjects = (
    projects: OrganizationProject[],
    canSeePreview: (preview: OrganizationProject) => boolean,
) => {
    const baseProjects = projects.filter((project) => {
        switch (project.type) {
            case ProjectType.DEFAULT:
            case ProjectType.TRAINING:
                return true;
            case ProjectType.PREVIEW:
                return false;
            default:
                return assertUnreachable(
                    project.type,
                    `Unknown project type: ${project.type}`,
                );
        }
    });
    const previewsByUpstream = new Map<string, OrganizationProject[]>();
    projects.forEach((project) => {
        if (project.type !== ProjectType.PREVIEW) return;
        if (!project.upstreamProjectUuid || !canSeePreview(project)) return;
        const existing =
            previewsByUpstream.get(project.upstreamProjectUuid) ?? [];
        existing.push(project);
        previewsByUpstream.set(project.upstreamProjectUuid, existing);
    });
    return { baseProjects, previewsByUpstream };
};

/** The org's training playground: labelled so nobody takes it for real work. */
export const isPlaygroundProject = (
    project: Pick<OrganizationProject, 'type'>,
) => project.type === ProjectType.TRAINING;
