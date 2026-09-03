import { ScimRequestAction } from '@lightdash/common';

export const SCIM_ACTION_LABELS: Record<ScimRequestAction, string> = {
    [ScimRequestAction.CREATE_USER]: 'Create user',
    [ScimRequestAction.UPDATE_USER]: 'Update user',
    [ScimRequestAction.DEACTIVATE_USER]: 'Deactivate user',
    [ScimRequestAction.DELETE_USER]: 'Delete user',
    [ScimRequestAction.ROLE_CHANGE]: 'Role change',
    [ScimRequestAction.MEMBERSHIP_CHANGE]: 'Membership change',
    [ScimRequestAction.CREATE_GROUP]: 'Create group',
    [ScimRequestAction.UPDATE_GROUP]: 'Update group',
    [ScimRequestAction.DELETE_GROUP]: 'Delete group',
    [ScimRequestAction.LOOKUP]: 'Lookup',
    [ScimRequestAction.LIST]: 'List',
    [ScimRequestAction.UNKNOWN]: 'Unknown',
};
