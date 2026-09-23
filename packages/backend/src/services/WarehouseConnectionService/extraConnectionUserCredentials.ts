import { type CreateWarehouseCredentials } from '@lightdash/common';
import { type ExtraConnectionCredentialSource } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';

export const EXTRA_CONNECTION_SELECT_CREDENTIALS_MESSAGE =
    "Select one of your warehouse credentials for this connection from the warehouse credentials menu in the navigation bar, or add new ones under 'User settings' → 'My warehouse connections'.";

export const getExtraConnectionRequireUserCredentials = (
    originalCredentials: CreateWarehouseCredentials,
    source: ExtraConnectionCredentialSource,
): boolean | undefined =>
    source.organizationWarehouseCredentialsUuid !== null &&
    source.credentials.requireUserCredentials === true
        ? true
        : originalCredentials.requireUserCredentials;
