import {
    getAllScopesForRole,
    getScopes,
    getTrainingProjectScopes,
    ProjectMemberRole,
    type ScopeGroup,
} from '@lightdash/common';
import { SCOPE_TOURS } from '../scopeTours/generated';

/**
 * One module per permission a learner can practise in the training project.
 * Nothing here is written by hand: the list is the trainee scope set, the
 * title is the scope registry's own description, the group is the registry's
 * group, and a module is available when a generated walkthrough exists for
 * it. Its blurb is that walkthrough's opening docs sentence.
 */
/**
 * Foundations, as on learn.lightdash.com: what a viewer can already do,
 * taught in the same format, and the first section of the library. Every
 * other group is the scope registry's own.
 */
const FOUNDATIONS = 'foundations' as const;
export type LearnGroup = ScopeGroup | typeof FOUNDATIONS;

export type LearnModule = {
    scope: string;
    title: string;
    group: LearnGroup;
    isEnterprise: boolean;
    /** The lowest project role that holds the scope; null if none does. */
    minRole: ProjectMemberRole | null;
    available: boolean;
    blurb: string;
    stepCount: number;
};

const ROLE_ORDER: ProjectMemberRole[] = [
    ProjectMemberRole.VIEWER,
    ProjectMemberRole.INTERACTIVE_VIEWER,
    ProjectMemberRole.EDITOR,
    ProjectMemberRole.DEVELOPER,
    ProjectMemberRole.ADMIN,
];

const stripBold = (text: string) => text.replace(/\*\*/g, '');

export const buildLearnCatalogue = (): LearnModule[] => {
    const trainee = new Set(getTrainingProjectScopes());
    // A role holds a feature when it holds the base scope or a variant it
    // can use without a further grant: `@public` (public spaces) for any
    // role that carries it, and `@space` / `@assigned` (via space access)
    // from editor up, since editors edit public spaces by default while an
    // interactive viewer only carries the variant in case a space grants
    // it. `@self` (own content only) never makes a role hold the feature.
    const roleScopes = ROLE_ORDER.map(
        (role) =>
            [
                role,
                new Set(
                    getAllScopesForRole(role)
                        .filter((name) => {
                            const modifier = name.split('@')[1];
                            if (!modifier || modifier === 'public') return true;
                            if (modifier === 'self') return false;
                            return (
                                ROLE_ORDER.indexOf(role) >=
                                ROLE_ORDER.indexOf(ProjectMemberRole.EDITOR)
                            );
                        })
                        .map((name) => name.split('@')[0]),
                ),
            ] as const,
    );
    return (
        getScopes({ isEnterprise: true })
            // Base scopes only: a modifier variant (`@self`, `@space`) is the
            // same feature with a narrower reach, not another lesson.
            .filter(
                (scope) => trainee.has(scope.name) && !scope.name.includes('@'),
            )
            .map((scope) => {
                const tour = SCOPE_TOURS[scope.name];
                const minRole =
                    roleScopes.find(([, held]) => held.has(scope.name))?.[0] ??
                    null;
                return {
                    scope: scope.name,
                    // A built walkthrough names itself (data-tour-title); a
                    // module still to come keeps the registry's words, minus
                    // the "all" that reads as a threat on a card.
                    title:
                        tour?.title ??
                        scope.description.replace(/\ball\b /, ''),
                    // What a viewer already holds is a Foundation; the rest
                    // sit where the registry puts them.
                    group:
                        minRole === ProjectMemberRole.VIEWER
                            ? FOUNDATIONS
                            : scope.group,
                    isEnterprise: scope.isEnterprise,
                    minRole,
                    available: tour !== undefined,
                    blurb: tour ? stripBold(tour.steps[0]?.body ?? '') : '',
                    stepCount: tour?.steps.length ?? 0,
                };
            })
            .sort(
                (a, b) =>
                    Number(b.available) - Number(a.available) ||
                    a.title.localeCompare(b.title),
            )
    );
};

/** Whether a role holds a module's scope (its rank is at or above the minimum). */
/** Available first, then modules the role holds, then by title. */
const sortForRole = (
    role: ProjectMemberRole,
    modules: LearnModule[],
): LearnModule[] =>
    [...modules].sort(
        (a, b) =>
            Number(b.available) - Number(a.available) ||
            Number(roleHolds(role, b)) - Number(roleHolds(role, a)) ||
            a.title.localeCompare(b.title),
    );

/**
 * The library's two focus cards: the walkthrough left unfinished (Resume)
 * and the first unfinished one after it, held-by-role first (Recommended
 * next). The completion page offers the same recommendation, so the two
 * pages never disagree about what comes next.
 */
export const focusModules = (
    role: ProjectMemberRole,
    available: LearnModule[],
    completed: string[],
    lastStarted: string | null,
): { resume?: LearnModule; recommended?: LearnModule } => {
    const resume = available.find(
        (m) => m.scope === lastStarted && !completed.includes(m.scope),
    );
    const recommended = sortForRole(role, available).find(
        (m) => m.scope !== resume?.scope && !completed.includes(m.scope),
    );
    return { resume, recommended };
};

const roleHolds = (role: ProjectMemberRole, module: LearnModule): boolean =>
    module.minRole !== null &&
    ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(module.minRole);

/** The project role a learner's organization role most resembles. */
export const roleFromOrganizationRole = (
    organizationRole: string | undefined,
): ProjectMemberRole =>
    ROLE_ORDER.find((role) => role === organizationRole) ??
    ProjectMemberRole.VIEWER;
