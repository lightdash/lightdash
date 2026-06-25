import { isRequestMethod, RequestMethod } from '../types/api';

export const LightdashRequestMethodHeader = 'Lightdash-Request-Method';
export const LightdashVersionHeader = 'Lightdash-Version';
export const LightdashSdkVersionHeader = 'Lightdash-SDK-Version';
export const LightdashCliVersionHeader = 'Lightdash-CLI-Version';
// Attaches the originating data app to a request so warehouse queries can be
// tagged with `app_uuid`. Self-reported provenance for tracking only — not
// authenticated, so it must not gate access or feed anything authoritative.
export const LightdashAppUuidHeader = 'Lightdash-App-Uuid';

export const getRequestMethod = (
    headerValue: string | undefined,
): RequestMethod =>
    isRequestMethod(headerValue) ? headerValue : RequestMethod.UNKNOWN;
