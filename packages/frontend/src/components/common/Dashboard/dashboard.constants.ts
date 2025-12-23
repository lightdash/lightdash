export const DASHBOARD_HEADER_HEIGHT = 50;
export const DASHBOARD_HEADER_ZINDEX = 100;
const DASHBOARD_TAB_HEIGHT = 50;
const DASHBOARD_TABS_ZINDEX = 99;

export const dashboardCSSVars = {
    '--dashboard-header-height': `${DASHBOARD_HEADER_HEIGHT}px`,
    '--dashboard-header-zindex': `${DASHBOARD_HEADER_ZINDEX}`,
    '--dashboard-tab-height': `${DASHBOARD_TAB_HEIGHT}px`,
    '--dashboard-tabs-zindex': `${DASHBOARD_TABS_ZINDEX}`,
} as const;
