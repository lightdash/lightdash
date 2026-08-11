import { isRequestMethod, RequestMethod } from '../types/api';

export const LightdashRequestMethodHeader = 'Lightdash-Request-Method';
export const LightdashVersionHeader = 'Lightdash-Version';
export const LightdashSdkVersionHeader = 'Lightdash-SDK-Version';
export const LightdashBuildHashHeader = 'Lightdash-Build-Hash';
export const LightdashCliVersionHeader = 'Lightdash-CLI-Version';
// Attaches the originating data app to a request so warehouse queries can be
// tagged with `app_uuid`. Self-reported provenance for tracking only — not
// authenticated, so it must not gate access or feed anything authoritative.
export const LightdashAppUuidHeader = 'Lightdash-App-Uuid';
export const LightdashAppPreviewTokenHeader = 'Lightdash-App-Preview-Token';
export const LIGHTDASH_APP_PREVIEW_TOKEN_MAX_AGE_SECONDS = 60 * 60;

// Declares that the file produced by a schedule-download request will be
// fetched from a context that cannot attach session credentials (the data-app
// sandbox iframe, or an app previewed on a local dev page), so the backend
// must mint a SIGNED download URL instead of a session-authenticated one.
// Client-set and unauthenticated, which is safe: a signed URL grants nothing
// the requesting session couldn't already download and share.
export const LightdashSignedDownloadHeader = 'Lightdash-Signed-Download';

export const getRequestMethod = (
    headerValue: string | undefined,
): RequestMethod =>
    isRequestMethod(headerValue) ? headerValue : RequestMethod.UNKNOWN;
