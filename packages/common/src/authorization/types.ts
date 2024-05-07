import { type Ability, type ForcedSubject } from '@casl/ability';
import { type OrganizationMemberProfile } from '../types/organizationMemberProfile';

type Action = 'manage' | 'update' | 'view' | 'create' | 'delete' | 'promote';

interface Project {
    organizationUuid: string;
    projectUuid: string;
}

interface Organization {
    organizationUuid: string;
}

type Subject =
    | Project
    | Organization
    | OrganizationMemberProfile
    | 'Project'
    | 'Organization'
    | 'OrganizationMemberProfile'
    | 'Dashboard'
    | 'Space'
    | 'SavedChart'
    | 'InviteLink'
    | 'Job'
    | 'SqlRunner'
    | 'Analytics'
    | 'Explore'
    | 'UnderlyingData'
    | 'ExportCsv'
    | 'CsvJobResult'
    | 'PinnedItems'
    | 'Validation'
    | 'Group'
    | 'ChangeCsvResults'
    | 'ScheduledDeliveries'
    | 'DashboardComments'
    | 'all';

type PossibleAbilities = [
    Action,
    Subject | ForcedSubject<Exclude<Subject, 'all'>>,
];

export type MemberAbility = Ability<PossibleAbilities>;
