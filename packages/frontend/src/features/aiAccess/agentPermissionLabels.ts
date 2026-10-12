import { type Group as OrganizationGroup } from '@lightdash/common';
import { type AgentPermissionChoice } from './agentPermissionDraft';

export const agentPermissionChoiceLabels: Record<
    AgentPermissionChoice,
    string
> = { person: 'Same as the person', read: 'Read and query', custom: 'Custom' };

export const agentGroupName = (uuid: string, groups: OrganizationGroup[]) =>
    groups.find((group) => group.uuid === uuid)?.name ?? 'A saved group';
