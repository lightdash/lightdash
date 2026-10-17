import { describe, expect, it } from 'vitest';
import {
    generateAiAgentOrbPalette,
    getAiAgentOrbBaseColor,
    getAiAgentOrbPalette,
} from './agentOrb';

const HEX = /^#[0-9a-f]{6}$/;

describe('agentOrb', () => {
    it('derives a stable base color from the agent uuid', () => {
        const uuid = '0f7c3a9e-1b2d-4c5e-8f90-123456789abc';
        expect(getAiAgentOrbBaseColor(uuid)).toBe(getAiAgentOrbBaseColor(uuid));
        expect(getAiAgentOrbBaseColor(uuid)).toMatch(HEX);
    });

    it('gives different agents different colors', () => {
        const a = getAiAgentOrbBaseColor('agent-a');
        const b = getAiAgentOrbBaseColor('agent-b');
        expect(a).not.toBe(b);
    });

    it('builds five hex stops around the base', () => {
        const palette = generateAiAgentOrbPalette('#7a4cff');
        expect(palette.base).toBe('#7a4cff');
        Object.values(palette).forEach((stop) => expect(stop).toMatch(HEX));
        expect(new Set(Object.values(palette)).size).toBe(5);
    });

    it('is deterministic end to end', () => {
        expect(getAiAgentOrbPalette('sales-agent')).toEqual(
            getAiAgentOrbPalette('sales-agent'),
        );
    });
});
