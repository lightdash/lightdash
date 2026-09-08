import { ScopeGroup } from '@lightdash/common';
import {
    IconBuilding,
    IconChartHistogram,
    IconCode,
    IconCompass,
    IconDatabase,
    IconSend,
    IconSettings,
    IconSparkles,
    IconTelescope,
    type Icon,
} from '@tabler/icons-react';
import { type CSSProperties } from 'react';
import { FOUNDATIONS, type LearnGroup } from './catalogue';

export const GROUP_ICONS: Record<LearnGroup, Icon> = {
    [FOUNDATIONS]: IconCompass,
    [ScopeGroup.CONTENT]: IconChartHistogram,
    [ScopeGroup.SHARING]: IconSend,
    [ScopeGroup.EMBED]: IconCode,
    [ScopeGroup.DATA]: IconDatabase,
    [ScopeGroup.AI]: IconSparkles,
    [ScopeGroup.PROJECT_MANAGEMENT]: IconSettings,
    [ScopeGroup.SPOTLIGHT]: IconTelescope,
    [ScopeGroup.ORGANIZATION_MANAGEMENT]: IconBuilding,
};

/**
 * Each group's hue, taken from the product's own colour ramps so the library
 * sits on Lightdash's palette in both schemes: the band is the ramp's lightest
 * tint on light and a deep mix of it on dark, the glyph a mid shade either way.
 */
const GROUP_HUES: Record<LearnGroup, string> = {
    [FOUNDATIONS]: 'indigo',
    [ScopeGroup.CONTENT]: 'teal',
    [ScopeGroup.SHARING]: 'cyan',
    [ScopeGroup.EMBED]: 'lime',
    [ScopeGroup.DATA]: 'yellow',
    [ScopeGroup.AI]: 'grape',
    [ScopeGroup.PROJECT_MANAGEMENT]: 'blue',
    [ScopeGroup.SPOTLIGHT]: 'orange',
    [ScopeGroup.ORGANIZATION_MANAGEMENT]: 'gray',
};

const hueVar = (hue: string, shade: number) =>
    `var(--mantine-color-${hue}-${shade})`;

export const groupVars = (group: LearnGroup) => {
    const hue = GROUP_HUES[group];
    return {
        '--mi-band': `light-dark(${hueVar(hue, 0)}, color-mix(in srgb, ${hueVar(
            hue,
            9,
        )} 28%, var(--mantine-color-background-0)))`,
        '--mi-fg': `light-dark(${hueVar(hue, 7)}, ${hueVar(hue, 3)})`,
    } as CSSProperties;
};
