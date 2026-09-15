import { type ApiOrganizationDesign } from '@lightdash/common';

// The composer's theme control stays out of the way until the draft reads as
// a data app request; from then on it stays for the rest of the client session.

const DATA_APP_DRAFT_MARKERS =
    /\b(?:data app|app|presentation|slideshow|slides|deck|pdf)\b/i;

export const isDataAppDraft = (text: string): boolean =>
    DATA_APP_DRAFT_MARKERS.test(text);

let surfacedThisSession = false;

export const hasThemeControlSurfaced = (): boolean => surfacedThisSession;

export const markThemeControlSurfaced = (): void => {
    surfacedThisSession = true;
};

export const THEME_CONTROL_TOOLTIP =
    'Theme for the data app this prompt builds';

/** The theme picked for the prompt being composed. */
export type ComposerTheme = {
    designUuid: string;
    slug: string;
    name: string;
};

export type ComposerThemeOption = Pick<
    ApiOrganizationDesign,
    'designUuid' | 'slug' | 'name' | 'isDefault'
>;

/** Unselected reads as "Apply theme", naming the organization default when one exists. */
export const getThemeControlLabel = (
    value: ComposerTheme | null,
    themes: ComposerThemeOption[],
): { label: string; detail: string | null } => {
    if (value) return { label: `Theme: ${value.name}`, detail: null };
    const defaultTheme = themes.find((theme) => theme.isDefault);
    return {
        label: 'Apply theme',
        detail: defaultTheme ? `Default: ${defaultTheme.name}` : null,
    };
};
