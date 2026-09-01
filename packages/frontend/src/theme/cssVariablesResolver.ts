import { type CSSVariablesResolver } from '@mantine/core';
import {
    DASHBOARD_HEADER_HEIGHT,
    DASHBOARD_HEADER_ZINDEX,
    DASHBOARD_TAB_HEIGHT,
    DASHBOARD_TABS_ZINDEX,
} from '../components/common/Dashboard/dashboard.constants';
import { CELL_HEIGHT as LIGHT_TABLE_CELL_HEIGHT } from '../components/common/LightTable/constants';
import {
    BANNER_HEIGHT,
    FOOTER_HEIGHT,
    NAVBAR_HEIGHT,
    PAGE_CONTENT_MAX_WIDTH_LARGE,
    PAGE_CONTENT_WIDTH,
    PAGE_HEADER_HEIGHT,
    PAGE_MIN_CONTENT_WIDTH,
    SIDEBAR_RESIZE_HANDLE_WIDTH,
    SIDEBAR_TOGGLE_RESERVE,
} from '../components/common/Page/constants';
import { LD_FIELD_COLORS } from './fieldColors';

/**
 * Semantic colors. Mantine's own tokens (`--mantine-color-body`, `-text`,
 * `-dimmed`, `-default-border`, …) are the vocabulary; the `light`/`dark`
 * blocks point them at our ramps so components and CSS modules can use the
 * token instead of a `light-dark()` pair.
 *
 * `--mantine-color-body` is the surface color (cards, inputs, popovers).
 * The page canvas behind the surfaces is `--ld-color-page`.
 *
 * Also bridges JS layout constants to global CSS variables so CSS modules can
 * reference them without re-declaring the literal values.
 */
export const cssVariablesResolver: CSSVariablesResolver = (theme) => ({
    variables: {
        '--ld-table-selected-bg':
            'light-dark(var(--mantine-color-blue-0), var(--mantine-color-blue-9))',
        '--ld-table-selected-border':
            'light-dark(var(--mantine-color-blue-6), var(--mantine-color-blue-5))',
        '--lightdash-table-font':
            theme.other.tableFont ?? "'Inter', sans-serif",
        '--lt-cell-height': `${LIGHT_TABLE_CELL_HEIGHT}px`,
        '--navbar-height': `${NAVBAR_HEIGHT}px`,
        '--banner-height': `${BANNER_HEIGHT}px`,
        '--page-header-height': `${PAGE_HEADER_HEIGHT}px`,
        '--footer-height': `${FOOTER_HEIGHT}px`,
        '--page-content-width': `${PAGE_CONTENT_WIDTH}px`,
        '--page-min-content-width': `${PAGE_MIN_CONTENT_WIDTH}px`,
        '--page-content-max-width-large': `${PAGE_CONTENT_MAX_WIDTH_LARGE}px`,
        '--sidebar-toggle-reserve': `${SIDEBAR_TOGGLE_RESERVE}px`,
        '--sidebar-resize-handle-width': `${SIDEBAR_RESIZE_HANDLE_WIDTH}px`,
        '--dashboard-header-height': `${DASHBOARD_HEADER_HEIGHT}px`,
        '--dashboard-header-zindex': `${DASHBOARD_HEADER_ZINDEX}`,
        '--dashboard-tab-height': `${DASHBOARD_TAB_HEIGHT}px`,
        '--dashboard-tabs-zindex': `${DASHBOARD_TABS_ZINDEX}`,
        '--ld-field-dimension-bg': LD_FIELD_COLORS.dimension.bg,
        '--ld-field-dimension-bg-hover': LD_FIELD_COLORS.dimension.bgHover,
        '--ld-field-dimension-color': LD_FIELD_COLORS.dimension.color,
        '--ld-field-metric-bg': LD_FIELD_COLORS.metric.bg,
        '--ld-field-metric-bg-hover': LD_FIELD_COLORS.metric.bgHover,
        '--ld-field-metric-color': LD_FIELD_COLORS.metric.color,
        '--ld-field-default-bg': LD_FIELD_COLORS.DEFAULT.bg,
        '--ld-field-default-bg-hover': LD_FIELD_COLORS.DEFAULT.bgHover,
        '--ld-field-default-color': LD_FIELD_COLORS.DEFAULT.color,
    },
    light: {
        '--mantine-color-body': theme.white,
        '--mantine-color-text': 'var(--mantine-color-gray-9)',
        '--mantine-color-dimmed': 'var(--mantine-color-gray-6)',
        '--mantine-color-placeholder': 'var(--mantine-color-gray-5)',
        '--mantine-color-anchor': 'var(--mantine-color-blue-6)',
        '--mantine-color-default-border': 'var(--mantine-color-gray-2)',
        '--mantine-color-default-hover': 'var(--mantine-color-gray-1)',
        '--mantine-color-disabled': 'var(--mantine-color-gray-1)',
        '--mantine-color-disabled-color': 'var(--mantine-color-gray-4)',
        '--mantine-color-disabled-border': 'var(--mantine-color-gray-2)',
        '--ld-color-page': 'var(--mantine-color-gray-0)',
    },
    dark: {
        '--mantine-color-body': 'var(--mantine-color-dark-6)',
        '--mantine-color-text': 'var(--mantine-color-dark-0)',
        '--mantine-color-dimmed': 'var(--mantine-color-dark-2)',
        '--mantine-color-placeholder': 'var(--mantine-color-dark-3)',
        '--mantine-color-anchor': 'var(--mantine-color-blue-4)',
        '--mantine-color-error': 'var(--mantine-color-red-5)',
        '--mantine-color-default-border': 'var(--mantine-color-dark-4)',
        '--mantine-color-default-hover': 'var(--mantine-color-dark-5)',
        '--ld-color-page': 'var(--mantine-color-dark-7)',
    },
});
