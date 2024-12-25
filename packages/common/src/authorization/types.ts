import { Ability, AbilityClass, type ForcedSubject } from '@casl/ability';
import { type OrganizationMemberProfile } from '../types/organizationMemberProfile';

export type AbilityAction =
    | 'manage'
    | 'update'
    | 'view'
    | 'create'
    | 'delete'
    | 'promote';

interface Project {
    organizationUuid: string;
    projectUuid: string;
}

interface Organization {
    organizationUuid: string;
}

type AbilitySubject =
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
    | 'CustomSql'
    | 'CompileProject'
    | 'SemanticViewer'
    | 'VirtualView'
    | 'Tags'
    | 'PersonalAccessToken'
    | 'MetricsTree'
    | 'all';

type PossibleAbilities = [
    AbilityAction,
    AbilitySubject | ForcedSubject<Exclude<AbilitySubject, 'all'>>,
];

export type MemberAbility = Ability<PossibleAbilities>;

export const AppAbility = Ability as AbilityClass<MemberAbility>;
