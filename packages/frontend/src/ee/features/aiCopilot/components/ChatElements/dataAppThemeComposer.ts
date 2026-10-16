import { type ApiOrganizationDesign } from '@lightdash/common';
import i18n from '../../../../../i18n/i18n';

// The composer's theme control stays out of the way until the draft reads as
// a data app request; from then on it stays while that composer is mounted.

const DATA_APP_DRAFT_MARKERS =
    /\b(?:data app|app|presentation|slideshow|slides|deck|pdf)\b/i;

export const isDataAppDraft = (text: string): boolean =>
    DATA_APP_DRAFT_MARKERS.test(text);

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
    if (value)
        return {
            label: i18n.t('contextItems.theme', {
                ns: 'aiCopilotChat',
                name: value.name,
            }),
            detail: null,
        };
    const defaultTheme = themes.find((theme) => theme.isDefault);
    return {
        label: i18n.t('theme.apply', { ns: 'aiCopilotChat' }),
        detail: defaultTheme
            ? i18n.t('theme.default', {
                  ns: 'aiCopilotChat',
                  name: defaultTheme.name,
              })
            : null,
    };
};
