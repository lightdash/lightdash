import { ScimRequestAction } from '@lightdash/common';
import i18n from '../../../../../i18n/i18n';

const ACTION_KEYS: Record<ScimRequestAction, string> = {
    [ScimRequestAction.CREATE_USER]: 'createUser',
    [ScimRequestAction.UPDATE_USER]: 'updateUser',
    [ScimRequestAction.DEACTIVATE_USER]: 'deactivateUser',
    [ScimRequestAction.DELETE_USER]: 'deleteUser',
    [ScimRequestAction.ROLE_CHANGE]: 'roleChange',
    [ScimRequestAction.MEMBERSHIP_CHANGE]: 'membershipChange',
    [ScimRequestAction.CREATE_GROUP]: 'createGroup',
    [ScimRequestAction.UPDATE_GROUP]: 'updateGroup',
    [ScimRequestAction.DELETE_GROUP]: 'deleteGroup',
    [ScimRequestAction.LOOKUP]: 'lookup',
    [ScimRequestAction.LIST]: 'list',
    [ScimRequestAction.UNKNOWN]: 'unknown',
};

export const getScimActionLabel = (action: ScimRequestAction) =>
    i18n.t(`scim.actions.${ACTION_KEYS[action]}`, { ns: 'serviceAccounts' });
