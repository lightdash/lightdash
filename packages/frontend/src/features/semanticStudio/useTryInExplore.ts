const PREVIEW_PROJECT = /\/projects\/([0-9a-f-]{36})/;

/** The project a pull request's preview link points at, or null without one. */
export const findPreviewProjectUuid = (
    previewUrl: string | null | undefined,
): string | null => PREVIEW_PROJECT.exec(previewUrl ?? '')?.[1] ?? null;
