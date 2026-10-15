import { type Group as OrganizationGroup } from '@lightdash/common';
import i18n from '../../i18n/i18n';
import { type AgentPermissionChoice } from './agentPermissionDraft';

export const agentPermissionChoiceLabels: Record<
    AgentPermissionChoice,
    string
> = {
    get person() {
        return i18n.t('permissionChoices.person', { ns: 'aiAccess' });
    },
    get read() {
        return i18n.t('permissionChoices.read', { ns: 'aiAccess' });
    },
    get custom() {
        return i18n.t('permissionChoices.custom', { ns: 'aiAccess' });
    },
};

export const agentGroupName = (uuid: string, groups: OrganizationGroup[]) =>
    groups.find((group) => group.uuid === uuid)?.name ??
    i18n.t('permissionChoices.savedGroupFallback', { ns: 'aiAccess' });
