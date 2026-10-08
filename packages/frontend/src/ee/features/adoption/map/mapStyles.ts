import { type ColourBy, type DotKind } from './geometry';

export const DOT_LABELS: Record<DotKind, string> = {
    active: 'Active in 30 days',
    idle: 'Not active in 30 days',
    lapsed: 'Active in 12 weeks',
    inactive: 'No activity in 12 weeks',
    admin: 'Admin',
    editor: 'Editor',
    interactiveViewer: 'Interactive viewer',
    viewer: 'Viewer',
    noAccount: 'No account',
};

// Drawn as a ring rather than a filled dot
export const OUTLINED_DOT_KINDS: ReadonlySet<DotKind> = new Set<DotKind>([
    'idle',
    'inactive',
    'viewer',
]);

export const COLOUR_BY_OPTIONS: ColourBy[] = ['active', 'role', 'lastActive'];

export const COLOUR_BY_LABELS: Record<ColourBy, string> = {
    active: 'Active in 30 days',
    role: 'Role',
    lastActive: 'Last active',
};

// Legend order, which is also the order dots are laid out from the centre
export const LEGEND_KINDS: Record<ColourBy, DotKind[]> = {
    active: ['active', 'idle', 'noAccount'],
    role: ['admin', 'editor', 'interactiveViewer', 'viewer', 'noAccount'],
    lastActive: ['active', 'lapsed', 'inactive', 'noAccount'],
};

export const isColourBy = (value: string): value is ColourBy =>
    COLOUR_BY_OPTIONS.some((option) => option === value);
