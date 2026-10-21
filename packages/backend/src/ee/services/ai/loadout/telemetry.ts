import type { Loadout } from './types';

const sortedAddOns = (loadout: Loadout): string[] => [...loadout.addOns].sort();

/** OpenTelemetry attributes for the span where the loadout is resolved. */
export const loadoutSpanAttributes = (loadout: Loadout) => ({
    'ai.agent.loadout.base': loadout.base,
    'ai.agent.loadout.add_ons': sortedAddOns(loadout),
    'ai.agent.loadout.skills': [...loadout.skills].sort(),
    'ai.agent.loadout.tool_count': loadout.toolNames.size,
});

/** AI SDK runtime context for the turn's `ai.*` spans; values must be scalars. */
export const loadoutTelemetryMetadata = (loadout: Loadout) => ({
    loadoutBase: loadout.base,
    loadoutAddOns: sortedAddOns(loadout).join(','),
});
