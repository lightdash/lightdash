import { type Ability, type ForcedSubject } from '@casl/ability';
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

export type CaslSubjectNames =
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
    | 'JobStatus'
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
    | 'SpotlightTableConfig'
    | 'ContentAsCode'
    | 'AiAgent'
    | 'AiAgentThread';

export type Subject =
    | CaslSubjectNames
    | Project
    | Organization
    | OrganizationMemberProfile
    | 'all';

export type PossibleAbilities = [
    AbilityAction,
    Subject | ForcedSubject<Exclude<Subject, 'all'>>,
];

export type MemberAbility = Ability<PossibleAbilities>;
