import { type Ability, type ForcedSubject } from '@casl/ability';
import { type OrganizationMemberProfile } from '../types/organizationMemberProfile';

export type AbilityAction =
    | 'create'
    | 'delete'
    | 'export'
    | 'manage'
    | 'promote'
    | 'update'
    | 'view';

interface Project {
    organizationUuid: string;
    projectUuid: string;
}

interface Organization {
    organizationUuid: string;
}

export type CaslSubjectNames =
    | 'AiAgent'
    | 'AiAgentThread'
    | 'Analytics'
    | 'ChangeCsvResults'
    | 'CompileProject'
    | 'ContentAsCode'
    | 'CustomSql'
    | 'Dashboard'
    | 'DashboardComments'
    | 'Explore'
    | 'ExportCsv'
    | 'Group'
    | 'InviteLink'
    | 'Job'
    | 'JobStatus'
    | 'MetricsTree'
    | 'Organization'
    | 'OrganizationMemberProfile'
    | 'PersonalAccessToken'
    | 'PinnedItems'
    | 'Project'
    | 'SavedChart'
    | 'ScheduledDeliveries'
    | 'SemanticViewer'
    | 'Space'
    | 'SpotlightTableConfig'
    | 'SqlRunner'
    | 'Tags'
    | 'UnderlyingData'
    | 'Validation'
    | 'VirtualView';

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
