import { type CSSVariablesResolver } from '@mantine-8/core';
import {
    DASHBOARD_HEADER_HEIGHT,
    DASHBOARD_HEADER_ZINDEX,
    DASHBOARD_TAB_HEIGHT,
    DASHBOARD_TABS_ZINDEX,
} from './components/common/Dashboard/dashboard.constants';
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
} from './components/common/Page/constants';

// Bridges JS layout constants to global CSS variables so CSS modules can
// reference them without re-declaring the literal values.
export const cssVariablesResolver: CSSVariablesResolver = () => ({
    variables: {
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
    },
    light: {},
    dark: {},
});
