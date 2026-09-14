import { type OrganizationProject, type Project } from '@lightdash/common';

type ProjectWithUrlIdentifier = Pick<
    Project | OrganizationProject,
    'projectUuid' | 'slug'
>;

export const getProjectUrlIdentifier = (project: ProjectWithUrlIdentifier) =>
    project.slug ?? project.projectUuid;
