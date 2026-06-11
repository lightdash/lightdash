import useEmbed from '../ee/providers/Embed/useEmbed';

/**
 * The timezone for the current viewing session, or null when none is set.
 *
 * "Session" means the timezone chosen for *how this view is being looked at
 * right now*, independent of any single piece of content. Today its only
 * source is the embed `?timezone=` URL param; non-embed views return null.
 *
 * This is deliberately NOT:
 *   - user timezone    — a per-account preference
 *   - chart timezone   — pinned on a saved chart
 *   - project timezone — project default
 *
 * Consumers should treat null as "no session override, fall back to the
 * usual server-side resolution". Future non-embed sources of a session
 * timezone should be resolved here so every consumer picks them up.
 */
export const useSessionTimezone = (): string | null => useEmbed().timezone;
