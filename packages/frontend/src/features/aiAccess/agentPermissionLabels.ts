import { type Group as OrganizationGroup } from '@lightdash/common';
import { type AgentPermissionChoice } from './agentPermissionDraft';

export const agentPermissionChoiceLabels: Record<
    AgentPermissionChoice,
    string
> = {
    person: 'Everything the person can do',
    read: 'Read and query only',
    custom: 'Custom',
};

export const agentGroupName = (uuid: string, groups: OrganizationGroup[]) =>
    groups.find((group) => group.uuid === uuid)?.name ?? 'A saved group';
