import { assertUnreachable } from '@lightdash/common';
import { ADD_ON_NAMES, ADD_ONS } from './addOns';
import { BASES } from './bases';
import type { AddOnName, Loadout, LoadoutBase, LoadoutInput } from './types';

export const selectLoadoutBase = (input: LoadoutInput): LoadoutBase => {
    const research =
        input.execution.mode === 'deep_research'
            ? input.execution.research
            : undefined;
    switch (research?.role) {
        case 'coordinator':
            return 'deep_research_coordinator';
        case 'worker':
            return 'deep_research_worker';
        case undefined:
            break;
        default:
            return assertUnreachable(research, 'Unknown research role');
    }
    if (input.enableComposerQueries) return 'composer';
    if (!input.enableDataAccess) return 'no_data_access';
    return 'classic';
};

/** Unions a base with the given add-ons it accepts. */
export const buildLoadout = (
    base: LoadoutBase,
    input: LoadoutInput,
    addOnNames: readonly AddOnName[],
): Loadout => {
    const definition = BASES[base](input);
    const addOns = definition.accepts.filter((name) =>
        addOnNames.includes(name),
    );
    return {
        base,
        addOns: new Set(addOns),
        toolNames: new Set([
            ...definition.tools,
            ...addOns.flatMap((name) => ADD_ONS[name].tools),
        ]),
        promptSections: new Set([
            ...definition.sections,
            ...addOns.flatMap((name) => {
                const { section } = ADD_ONS[name];
                return section ? [section.id] : [];
            }),
        ]),
    };
};

/** Pure and total: one base plus the add-ons it accepts whose condition holds. */
export const resolveLoadout = (input: LoadoutInput): Loadout =>
    buildLoadout(
        selectLoadoutBase(input),
        input,
        ADD_ON_NAMES.filter((name) => ADD_ONS[name].when(input)),
    );
