import { type ComposerVizKind, type ComposerVizPlan } from '@lightdash/common';

/** The chosen kind when the plan still offers it, else the plan's default. */
export const pickVizKind = (
    plan: ComposerVizPlan,
    chosen: ComposerVizKind | undefined,
): ComposerVizKind =>
    chosen && plan.availableKinds.includes(chosen) ? chosen : plan.defaultKind;
