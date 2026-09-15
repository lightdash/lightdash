import { subject } from '@casl/ability';
import { type ProjectSummary, type ProjectType } from '../types/projects';

type ExistingProjectAbilitySubject = Pick<
    ProjectSummary,
    | 'organizationUuid'
    | 'projectUuid'
    | 'type'
    | 'createdByUserUuid'
    | 'upstreamProjectUuid'
>;

type NewProjectAbilitySubject = {
    organizationUuid: string;
    type: ProjectType;
    upstreamProjectUuid?: string;
};

export const projectAbilitySubject = <T>(
    project: T & ExistingProjectAbilitySubject,
) => subject('Project', project);

export const newProjectAbilitySubject = <T>(
    project: T & NewProjectAbilitySubject,
) => subject('Project', project);
