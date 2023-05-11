import { Ability } from '@casl/ability';
import {
    LightdashMode,
    OrganizationMemberRole,
    SessionUser,
    ShareUrl,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';

export const config = {
    mode: LightdashMode.DEFAULT,
    siteUrl: 'https://test.lightdash.cloud',
} as LightdashConfig;

export const chart = {};
export const explore = {};
