import {
    IconAppWindow,
    IconChartArea,
    IconChartAreaLine,
    IconChartBar,
    IconChartDots,
    IconChartLine,
    IconChartPie,
    IconChartTreemap,
    IconCode,
    IconFileText,
    IconFilter,
    IconFolder,
    IconGauge,
    IconGitMerge,
    IconLayoutDashboard,
    IconMap,
    IconPuzzle,
    IconSquareNumber1,
    IconTable,
} from '@tabler/icons-react';
import {
    ACCENT_ICONS,
    OUTLINE_ICONS,
    SOLID_ICONS,
    type ContentIconSet,
} from './contentIcons';
import { type ContentIconSetKey } from './contentIconSetStore';
import { TECHNICAL_ICONS } from './technicalIcons';

/** What the app ships today. The horizontal bar is the bar icon, rotated by callers. */
export const CURRENT_ICONS: ContentIconSet = {
    dashboard: IconLayoutDashboard,
    space: IconFolder,
    dataApp: IconAppWindow,
    document: IconFileText,
    table: IconTable,
    bar: IconChartBar,
    horizontalBar: IconChartBar,
    line: IconChartLine,
    area: IconChartArea,
    mixed: IconChartAreaLine,
    scatter: IconChartDots,
    pie: IconChartPie,
    bigNumber: IconSquareNumber1,
    funnel: IconFilter,
    treemap: IconChartTreemap,
    gauge: IconGauge,
    map: IconMap,
    sankey: IconGitMerge,
    custom: IconCode,
    dataAppViz: IconPuzzle,
};

export const CONTENT_ICON_SETS: Record<ContentIconSetKey, ContentIconSet> = {
    current: CURRENT_ICONS,
    a: OUTLINE_ICONS,
    b: ACCENT_ICONS,
    c: SOLID_ICONS,
    d: TECHNICAL_ICONS,
};
