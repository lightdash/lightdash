/**
 * Parses a copy-pasted Lightdash URL into the resource it points at. Returns
 * null for anything else, so callers can fall back to treating it as text.
 */
export type ParsedResourceLink =
    | {
          type: 'chart';
          projectUuid: string;
          chartUuidOrSlug: string;
      }
    | {
          type: 'dashboard';
          projectUuid: string;
          dashboardUuidOrSlug: string;
      }
    // Recognised but not attachable: a short link needs a server round-trip to
    // expand, and an explore URL carries unsaved query state, not a chart.
    | { type: 'shortLink' }
    | { type: 'exploreState' };

const RESOURCE_PATH =
    /^(?:\/minimal)?\/projects\/([^/]+)\/(saved|dashboards)\/([^/?#]+)/;
const EXPLORE_PATH = /^(?:\/minimal)?\/projects\/[^/]+\/tables(?:\/|$)/;
const SHORT_LINK_PATH = /^\/share\/[^/?#]+/;

// Lets a bare path parse the same way as a link copied from any Lightdash host.
const PLACEHOLDER_ORIGIN = 'https://lightdash.invalid';

export const parseResourceLink = (input: string): ParsedResourceLink | null => {
    const trimmed = input.trim();
    if (!trimmed) return null;

    let pathname: string;
    try {
        pathname = new URL(trimmed, PLACEHOLDER_ORIGIN).pathname;
    } catch {
        return null;
    }

    const resource = RESOURCE_PATH.exec(pathname);
    if (resource) {
        const [, projectUuid, contentType, uuidOrSlug] = resource;
        return contentType === 'saved'
            ? { type: 'chart', projectUuid, chartUuidOrSlug: uuidOrSlug }
            : {
                  type: 'dashboard',
                  projectUuid,
                  dashboardUuidOrSlug: uuidOrSlug,
              };
    }
    if (EXPLORE_PATH.test(pathname)) return { type: 'exploreState' };
    if (SHORT_LINK_PATH.test(pathname)) return { type: 'shortLink' };
    return null;
};
