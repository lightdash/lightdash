import { BASES, type Loadout, type LoadoutBase } from '.';
import { loadoutSpanAttributes, loadoutTelemetryMetadata } from './telemetry';

const loadoutFor = (base: LoadoutBase): Loadout => ({
    base,
    addOns: new Set(['skills', 'contentReads', 'mcp']),
    toolNames: new Set(['runQuery', 'findContent', 'loadSkill']),
    promptSections: new Set(),
    skills: new Set(['developing-in-lightdash']),
});

describe('loadout telemetry', () => {
    it('describes base, sorted add-ons, skills and tool count', () => {
        const loadout = loadoutFor('composer');

        expect(loadoutSpanAttributes(loadout)).toEqual({
            'ai.agent.loadout.base': 'composer',
            'ai.agent.loadout.add_ons': ['contentReads', 'mcp', 'skills'],
            'ai.agent.loadout.skills': ['developing-in-lightdash'],
            'ai.agent.loadout.tool_count': 3,
        });
        expect(loadoutTelemetryMetadata(loadout)).toEqual({
            loadoutBase: 'composer',
            loadoutAddOns: 'contentReads,mcp,skills',
        });
    });

    it('describes a loadout without add-ons', () => {
        const loadout: Loadout = {
            ...loadoutFor('classic'),
            addOns: new Set(),
            toolNames: new Set(),
        };

        expect(loadoutSpanAttributes(loadout)).toMatchObject({
            'ai.agent.loadout.add_ons': [],
            'ai.agent.loadout.tool_count': 0,
        });
        expect(loadoutTelemetryMetadata(loadout).loadoutAddOns).toBe('');
    });

    it.each(Object.keys(BASES) as LoadoutBase[])('is total for %s', (base) => {
        expect(loadoutSpanAttributes(loadoutFor(base))).toMatchObject({
            'ai.agent.loadout.base': base,
        });
        expect(loadoutTelemetryMetadata(loadoutFor(base)).loadoutBase).toBe(
            base,
        );
    });
});
