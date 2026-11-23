import { type MantineSize } from '@mantine/core';

export const PAGE_HEADER_HEIGHT = 64;

export const NAVBAR_HEIGHT = 50;
export const BANNER_HEIGHT = 35;
export const APP_SIDEBAR_WIDTH = 248;
export const APP_SIDEBAR_MIN_WIDTH = 200;
export const APP_SIDEBAR_MAX_WIDTH = 400;
export const APP_SIDEBAR_RAIL_WIDTH = 49;
// As tall as the sidebar's header row, so the preview's name lines up with the project selector.
export const APP_PREVIEW_GUTTER_HEIGHT = 48;
// Dragging the sidebar's edge narrower than this collapses it to the rail.
export const APP_SIDEBAR_COLLAPSE_THRESHOLD = 140;

export const FOOTER_HEIGHT = 80;
export const FOOTER_MARGIN: MantineSize = 'lg';

export const PAGE_CONTENT_WIDTH = 900;
export const PAGE_CONTENT_MAX_WIDTH_LARGE = 1600;
export const PAGE_MIN_CONTENT_WIDTH = 600;

export const SIDEBAR_DEFAULT_WIDTH = 400;
export const SIDEBAR_MIN_WIDTH = 320;

export const SIDEBAR_RESIZE_HANDLE_WIDTH = 6;

// Left gutter reserved on full-width content so the floating collapse toggle
// (rendered at the top-left when the sidebar is collapsed) clears the page title.
export const SIDEBAR_TOGGLE_RESERVE = 48;

export const SIDEBAR_ANIMATION_DURATION = 150;

export const Z_INDEX_STICKY = 100;
export const Z_INDEX_STICKY_HEADER = 110;
export const Z_INDEX_FLOATING = 1000;
export const Z_INDEX_TOUR = 10000;
export const Z_INDEX_TOUR_CARD = 10001;
