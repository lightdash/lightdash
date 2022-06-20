import { Ability, ForcedSubject } from '@casl/ability';
import { Organization } from '../types/organization';
import { OrganizationMemberProfile } from '../types/organizationMemberProfile';

type Action = 'manage' | 'update' | 'view' | 'create' | 'delete';

interface Project {
    organizationUuid: string;
    projectUuid: string;
}

type Subject =
    | Project
    | Organization
    | OrganizationMemberProfile
    | 'Project'
    | 'Organization'
    | 'OrganizationMemberProfile'
    | 'Dashboard'
    | 'SavedChart'
    | 'InviteLink'
    | 'Job'
    | 'all';

type PossibleAbilities = [
    Action,
    Subject | ForcedSubject<Exclude<Subject, 'all'>>,
];

export type MemberAbility = Ability<PossibleAbilities>;
