import { ScopeGroup } from '@lightdash/common';
import {
    IconBuilding,
    IconChartHistogram,
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
    [ScopeGroup.DATA]: IconDatabase,
    [ScopeGroup.AI]: IconSparkles,
    [ScopeGroup.PROJECT_MANAGEMENT]: IconSettings,
    [ScopeGroup.SPOTLIGHT]: IconTelescope,
    [ScopeGroup.ORGANIZATION_MANAGEMENT]: IconBuilding,
};

/** The library's band and glyph colours per group, as on learn.lightdash.com. */
const GROUP_COLOURS: Record<LearnGroup, { band: string; fg: string }> = {
    [FOUNDATIONS]: { band: '#f0dbd1', fg: '#b06a4c' },
    [ScopeGroup.CONTENT]: { band: '#dfe8e2', fg: '#4f7d5d' },
    [ScopeGroup.SHARING]: { band: '#dfe8e2', fg: '#4f7d5d' },
    [ScopeGroup.DATA]: { band: '#ece3d1', fg: '#93743a' },
    [ScopeGroup.AI]: { band: '#e2ddf1', fg: '#6b5bb8' },
    [ScopeGroup.PROJECT_MANAGEMENT]: { band: '#d9e6e4', fg: '#41756f' },
    [ScopeGroup.SPOTLIGHT]: { band: '#ece3d1', fg: '#93743a' },
    [ScopeGroup.ORGANIZATION_MANAGEMENT]: { band: '#dfe1e6', fg: '#5b6478' },
};

export const groupVars = (group: LearnGroup) =>
    ({
        '--mi-band': GROUP_COLOURS[group].band,
        '--mi-fg': GROUP_COLOURS[group].fg,
    }) as CSSProperties;
