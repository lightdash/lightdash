import { LightdashMode } from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';

export const Config = {
    mode: LightdashMode.DEFAULT,
    siteUrl: 'https://test.lightdash.cloud',
} as LightdashConfig;

export const ShareUrl = {
    nanoid: 'abc123',
    params: 'foo=bar',
    path: 'projects/uuid/tables/customers',
};

export const FullShareUrl = {
    ...ShareUrl,
    host: Config.siteUrl,
    url: `${Config.siteUrl}/${ShareUrl.path}?${ShareUrl.params}`,
};

export const ShareUrlWithoutParams = {
    nanoid: 'abc123',
    params: '',
    path: 'projects/uuid/tables/customers',
};

export const FullShareUrlWithoutParams = {
    ...ShareUrlWithoutParams,
    host: Config.siteUrl,
    url: `${Config.siteUrl}/${ShareUrl.path}`,
};
