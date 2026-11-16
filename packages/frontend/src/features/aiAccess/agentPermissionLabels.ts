import { type Group as OrganizationGroup } from '@lightdash/common';
import { type AgentPermissionChoice } from './agentPermissionDraft';

export const agentPermissionChoiceLabels: Record<
    AgentPermissionChoice,
    string
> = {
    person: 'Match the person',
    read: 'Read and query only',
    custom: 'Custom scope',
};

export const agentGroupName = (uuid: string, groups: OrganizationGroup[]) =>
    groups.find((group) => group.uuid === uuid)?.name ?? 'A saved group';
