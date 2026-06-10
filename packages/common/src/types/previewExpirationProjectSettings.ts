import { type ApiSuccess } from './api/success';

export type PreviewExpirationProjectSettings = {
    projectUuid: string;
    defaultPreviewExpirationHours: number;
    maxPreviewExpirationHours: number;
};

export type UpdatePreviewExpirationProjectSettings = {
    defaultPreviewExpirationHours: number;
    maxPreviewExpirationHours: number;
};

export type ApiPreviewExpirationProjectSettingsResponse =
    ApiSuccess<PreviewExpirationProjectSettings>;
