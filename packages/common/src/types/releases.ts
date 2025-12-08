import type { ApiSuccess } from './api/success';

/**
 * Represents a single item in a release (feature, fix, chore, etc.)
 *
 * @example
 * ```json
 * {
 *   "type": "feat",
 *   "scope": "dashboard",
 *   "description": "add dark mode support",
 *   "prNumber": 18575,
 *   "prUrl": "https://github.com/lightdash/lightdash/pull/18575"
 * }
 * ```
 */
export type ReleaseItem = {
    /** Type of change: feat, fix, chore, docs, refactor, etc. */
    type: string;
    /** Scope of the change if specified (e.g., backend, frontend) */
    scope: string | null;
    /** Description of the change */
    description: string;
    /** PR number if available */
    prNumber: number | null;
    /** Link to the PR */
    prUrl: string | null;
};

/**
 * Represents a GitHub release
 *
 * @example
 * ```json
 * {
 *   "version": "0.1234.0",
 *   "title": "Release 0.1234.0",
 *   "publishedAt": "2025-12-01T10:00:00Z",
 *   "url": "https://github.com/lightdash/lightdash/releases/tag/0.1234.0",
 *   "items": [...],
 *   "isCurrent": true
 * }
 * ```
 */
export type Release = {
    /** Release version tag (e.g., "0.1234.0") */
    version: string;
    /** Release title/name */
    title: string;
    /** When the release was published (ISO 8601 format) */
    publishedAt: string;
    /** URL to the release on GitHub */
    url: string;
    /** Parsed items from the release notes */
    items: ReleaseItem[];
    /** Whether this is the current deployed version */
    isCurrent: boolean;
};

/**
 * Response for the releases timeline API.
 *
 * ## Pagination
 * - First request (no cursor) returns releases centered around the current deployed version
 * - Use `nextCursor` + `direction=before` to get older releases
 * - Use `previousCursor` + `direction=after` to get newer releases
 * - `hasPrevious` indicates if newer releases exist (scroll up)
 * - `hasNext` indicates if older releases exist (scroll down)
 *
 * @example
 * ```json
 * {
 *   "currentVersion": "0.1234.0",
 *   "currentVersionFound": true,
 *   "releases": [...],
 *   "hasPrevious": false,
 *   "hasNext": true,
 *   "previousCursor": null,
 *   "nextCursor": "0.1233.0"
 * }
 * ```
 */
export type ReleasesTimeline = {
    /** Current deployed version */
    currentVersion: string;
    /** Whether the current version was found in the releases list */
    currentVersionFound: boolean;
    /** List of releases ordered by publish date descending (newest first) */
    releases: Release[];
    /** Whether there are more (newer) releases before the first one in the list */
    hasPrevious: boolean;
    /** Whether there are more (older) releases after the last one in the list */
    hasNext: boolean;
    /** Cursor for pagination - use with direction=after to fetch newer releases */
    previousCursor: string | null;
    /** Cursor for pagination - use with direction=before to fetch older releases */
    nextCursor: string | null;
};

export type ApiReleasesTimelineResponse = ApiSuccess<ReleasesTimeline>;
