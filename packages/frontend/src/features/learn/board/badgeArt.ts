// Badge art copied from lightdash-university academy/badges.ts (PALETTES,
// TIER_MOTIFS, badgeSvg, tierBadgeSvg): no sync check covers it, so keep both by hand.

import { type BadgeRung } from './badgesView';

// Slots read outline, body, highlight, inner mark. Slot 4 is near white so the
// emblem's inner mark reads as a white counter; `locked` is deepened off near
// white so it still shows on a light rail.
const PALETTES: Record<BadgeRung, [string, string, string, string]> = {
    violet: ['#3d22b8', '#6b46f0', '#9b83ff', '#f5f1ff'],
    locked: ['#8e8e9a', '#a8a8b4', '#c4c4ce', '#ecedf0'],
    bronze: ['#8c5a2b', '#b6763a', '#d6994f', '#fff7ec'],
    silver: ['#5f6672', '#878e9b', '#b6bcc6', '#ffffff'],
    gold: ['#8a6d1a', '#c9a02c', '#eac545', '#fffbe9'],
};

// Tier reads from the silhouette (orb, shield, diamond, gem, rosette), not from
// the palette alone, so a badge stays legible at 16px and in monochrome.
const TIER_MOTIFS: Record<BadgeRung, string[]> = {
    locked: [
        '................',
        '................',
        '................',
        '................',
        '......4444......',
        '.....422224.....',
        '....42144124....',
        '...4214444124...',
        '...4214444124...',
        '...4214444124...',
        '...1214444121...',
        '....12144121....',
        '.....122221.....',
        '......1111......',
        '................',
        '................',
    ],
    bronze: [
        '................',
        '................',
        '...1111111111...',
        '...4333333334...',
        '...4222222224...',
        '...4212222124...',
        '...4214444124...',
        '...4214444124...',
        '...3213443123...',
        '...1221331221...',
        '....12211221....',
        '.....122221.....',
        '......1221......',
        '.......11.......',
        '................',
        '................',
    ],
    silver: [
        '................',
        '................',
        '................',
        '.......44.......',
        '......4334......',
        '.....431134.....',
        '....43144134....',
        '...4214444124...',
        '...4214444124...',
        '....22144122....',
        '.....221122.....',
        '......2222......',
        '.......22.......',
        '................',
        '................',
        '................',
    ],
    gold: [
        '................',
        '................',
        '................',
        '....44444444....',
        '...4222222224...',
        '..422111111224..',
        '..421444444124..',
        '..421444444124..',
        '...2214444122...',
        '....22144122....',
        '.....221122.....',
        '......2222......',
        '.......22.......',
        '................',
        '................',
        '................',
    ],
    violet: [
        '................',
        '................',
        '................',
        '.......44.......',
        '.....442244.....',
        '....42211224....',
        '...4221441224...',
        '...4214444124...',
        '...4214444124...',
        '...2221441222...',
        '....22211222....',
        '.....222222.....',
        '......2222......',
        '................',
        '................',
        '................',
    ],
};

const badgeSvg = (motif: string[], rung: BadgeRung, cell: number): string => {
    const rects: string[] = [];
    motif.forEach((row, r) => {
        for (let c = 0; c < row.length; c += 1) {
            const ch = row[c];
            if (ch === '.') continue;
            const fill = PALETTES[rung][Number(ch) - 1];
            rects.push(
                `<rect x="${c * cell}" y="${r * cell}" width="${cell}" height="${cell}" fill="${fill}"/>`,
            );
        }
    });
    const size = 16 * cell;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" aria-hidden="true">${rects.join('')}</svg>`;
};

export const tierBadgeSvg = (rung: BadgeRung, cell: number): string =>
    badgeSvg(TIER_MOTIFS[rung], rung, cell);
