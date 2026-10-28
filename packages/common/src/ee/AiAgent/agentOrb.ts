import { hslToHex, shiftHsl, type HexColor } from '../../types/userAvatars';

/* Five stops that drive the AiAgentIcon orb. Defaults in the CSS module are
   the brand violet; a palette derived from an agent uuid swaps them. */
export type AiAgentOrbPalette = {
    base: HexColor;
    light: HexColor;
    lighter: HexColor;
    deep: HexColor;
    accent: HexColor;
};

/* Polynomial hash with a second mixing pass so near-identical ids land on
   distant hues (plain multiply-add keeps sequential ids adjacent). */
const hashString = (value: string): number => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash * 31 + value.charCodeAt(i)) % 2147483647;
    }
    let mixed = hash;
    for (let i = 0; i < 3; i += 1) {
        mixed = (mixed * 1103515245 + 12345) % 2147483648;
    }
    return Math.floor(mixed / 65536);
};

/* Yellows and cyans read washed out at the violet's lightness; dip them. */
const lightnessForHue = (hue: number): number => {
    const dip = (center: number, width: number, depth: number) => {
        const d = Math.min(
            Math.abs(hue - center),
            360 - Math.abs(hue - center),
        );
        return d < width ? depth * (1 - d / width) : 0;
    };
    return 64 - dip(60, 60, 16) - dip(180, 40, 8);
};

/* Same hue/lightness offsets the brand orb uses around its base violet. */
export const generateAiAgentOrbPalette = (
    base: HexColor,
): AiAgentOrbPalette => ({
    base,
    light: shiftHsl(base, { hueShift: 4, lightShift: 12 }),
    lighter: shiftHsl(base, { lightShift: 21 }),
    deep: shiftHsl(base, { hueShift: -10 }),
    accent: shiftHsl(base, { hueShift: 13, lightShift: -5 }),
});

export const getAiAgentOrbBaseColor = (agentUuid: string): HexColor => {
    const hue = hashString(agentUuid) % 360;
    return hslToHex({ h: hue, s: 92, l: lightnessForHue(hue) });
};

export const getAiAgentOrbPalette = (agentUuid: string): AiAgentOrbPalette =>
    generateAiAgentOrbPalette(getAiAgentOrbBaseColor(agentUuid));
