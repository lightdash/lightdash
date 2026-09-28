import { SCOPE_TOURS, type ScopeTourDefinition } from './generated';

/**
 * The one way to look a tour up by scope name.
 *
 * `SCOPE_TOURS` is a generated object literal, so indexing it with a name
 * that only exists on `Object.prototype` (`constructor`, `toString`,
 * `hasOwnProperty`) answers with a function rather than `undefined`. Scope
 * names arrive from links and session storage as well as the catalogue, so
 * every lookup goes through an own-property check.
 */
export const tourFor = (
    scope: string | null | undefined,
): ScopeTourDefinition | undefined =>
    scope && Object.prototype.hasOwnProperty.call(SCOPE_TOURS, scope)
        ? SCOPE_TOURS[scope]
        : undefined;
