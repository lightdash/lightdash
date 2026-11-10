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

/**
 * Every scope the lesson behind `scope` teaches: the lesson's own scope
 * first, then the ones it covers with the same controls. A scope whose
 * entry is a copy of another lesson answers with that lesson's scopes, so
 * either name leads to the same card and the same progress. An unknown
 * scope stands for itself.
 */
export const lessonScopesFor = (scope: string): string[] => {
    const tour = tourFor(scope);
    const primary = tour?.coveredBy ?? scope;
    const covers = tourFor(primary)?.covers ?? [];
    return [primary, ...covers.filter((covered) => covered !== primary)];
};
