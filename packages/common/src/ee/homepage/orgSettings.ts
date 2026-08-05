import { type ApiSuccess } from '../../types/api/success';

/** Which hero opens the homepage: the Ask AI composer or greeting + quick
 * actions. An admin's layout decision, independent of whether AI is licensed. */
export type HomepageOpening = 'ask-first' | 'content-first';

export const HOMEPAGE_OPENINGS: HomepageOpening[] = [
    'ask-first',
    'content-first',
];

export const isHomepageOpening = (value: unknown): value is HomepageOpening =>
    typeof value === 'string' &&
    HOMEPAGE_OPENINGS.includes(value as HomepageOpening);

/** Homepage v2 is on for every EE-licensed organization; an org only leaves it
 * by explicitly switching back to the classic homepage. */
export const DEFAULT_HOMEPAGE_ENABLED = true;

/** Org-wide homepage v2 state. `enabled` turns the new homepage on for every
 * project in the organization. `opening: null` means "auto" — AI availability
 * decides, which is the behaviour for orgs that never picked an opening. */
export type OrganizationHomepageSettings = {
    organizationUuid: string;
    enabled: boolean;
    opening: HomepageOpening | null;
};

export type UpdateOrganizationHomepageSettings = {
    enabled: boolean;
    opening: HomepageOpening | null;
};

/** Subtitle a greeting hero starts with, shared by the starter homepage and
 * the opt-in swap of stored ask heroes to greetings. */
export const HOMEPAGE_DEFAULT_GREETING_SUBTITLE =
    'Pick up where you left off, or start something new.';

export type ApiOrganizationHomepageSettingsResponse =
    ApiSuccess<OrganizationHomepageSettings>;
