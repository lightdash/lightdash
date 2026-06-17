/**
 * Embedded surfaces that expose a public class contract. Every contract class
 * is scoped to one of these. Add a surface here before using it in a classname.
 */
type EmbedSurface = 'dashboard';

/**
 * Public CSS class contract for embedded dashboards.
 *
 * Each entry is a STABLE classname that embedding customers target to override
 * styles. This is a public API: once a name ships, renaming or removing it
 * breaks customer stylesheets. Add new names freely; treat every existing one
 * as frozen.
 *
 * Convention: ld-[surface]-[element], where [surface] is the embedded surface the
 * customer sees (dashboard), NOT the React component. Apply only on embed-owned
 * wrappers, or — for portalled dropdowns — via the rendering component's
 * `classNames={{ dropdown }}`. Never apply inside a shared component
 * unconditionally, or the class leaks outside embeds.
 */
const EMBED_CLASS_CONTRACT = [
    'ld-dashboard-header',
    'ld-dashboard-filters',
    'ld-dashboard-date-zoom',
    'ld-dashboard-parameters',
    'ld-dashboard-filter-dropdown', // portalled
    'ld-dashboard-date-zoom-dropdown', // portalled
    'ld-dashboard-parameter-dropdown', // portalled
] as const satisfies readonly `ld-${EmbedSurface}-${string}`[];

export type EmbedContractClassName = (typeof EMBED_CLASS_CONTRACT)[number];

type ClassValue = string | false | null | undefined;

/**
 * Joins a stable public classname with the internal (hashed) CSS-module classes
 * that own the styling. The public class is frozen across builds; the module
 * classes are free to change.
 *
 *   className={embedContractClass('ld-dashboard-header', styles.headerBar)}
 */
export const embedContractClass = (
    name: EmbedContractClassName,
    ...moduleClasses: ClassValue[]
): string => [name, ...moduleClasses].filter(Boolean).join(' ');
