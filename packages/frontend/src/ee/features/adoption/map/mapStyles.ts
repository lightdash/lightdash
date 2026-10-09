import { type ColourBy, type DotKind } from './geometry';

export const DOT_LABELS: Record<DotKind, string> = {
    healthy: 'Healthy',
    atRisk: 'At risk',
    lost: 'Lost',
    admin: 'Admin',
    editor: 'Editor',
    interactiveViewer: 'Interactive viewer',
    viewer: 'Viewer',
    noAccount: 'No account',
};

// Drawn as a ring rather than a filled dot: viewers, and people without an account as light grey rings, so
// they differ from the filled dots in lightness, not only in hue
export const OUTLINED_DOT_KINDS: ReadonlySet<DotKind> = new Set<DotKind>([
    'viewer',
    'noAccount',
]);

export const COLOUR_BY_OPTIONS: ColourBy[] = ['activity', 'role'];

export const COLOUR_BY_LABELS: Record<ColourBy, string> = {
    activity: 'Activity',
    role: 'Role',
};

// Legend order, which is also the order dots are laid out from the centre
export const LEGEND_KINDS: Record<ColourBy, DotKind[]> = {
    activity: ['healthy', 'atRisk', 'lost', 'noAccount'],
    role: ['admin', 'editor', 'interactiveViewer', 'viewer', 'noAccount'],
};

export const isColourBy = (value: string): value is ColourBy =>
    COLOUR_BY_OPTIONS.some((option) => option === value);
