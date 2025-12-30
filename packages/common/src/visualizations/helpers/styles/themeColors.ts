/**
 * Theme color constants for ECharts styling
 * Centralizes color usage across all chart style utilities
 * Using Mantine default color palette
 *
 * IMPORTANT: These use CSS variables WITH fallback values because CSS variables
 * are not resolved when exporting charts to images via ECharts.getDataURL().
 * The fallback ensures colors work in both DOM rendering and image exports.
 *
 * Light mode colors are used as fallbacks since charts are typically exported
 * with white backgrounds (MinimalSavedExplorer uses backgroundColor: 'white').
 */

// Light mode gray scale (from mantineTheme.ts lightModeColors.ldGray)
export const GRAY_0 = 'var(--mantine-color-ldGray-0, #f8f9fa)';
export const GRAY_1 = 'var(--mantine-color-ldGray-1, #f1f3f5)';
export const GRAY_2 = 'var(--mantine-color-ldGray-2, #e9ecef)';
export const GRAY_3 = 'var(--mantine-color-ldGray-3, #dee2e6)';
export const GRAY_4 = 'var(--mantine-color-ldGray-4, #ced4da)';
export const GRAY_5 = 'var(--mantine-color-ldGray-5, #adb5bd)';
export const GRAY_6 = 'var(--mantine-color-ldGray-6, #868e96)';
export const GRAY_7 = 'var(--mantine-color-ldGray-7, #495057)';
export const GRAY_8 = 'var(--mantine-color-ldGray-8, #343a40)';
export const GRAY_9 = 'var(--mantine-color-ldGray-9, #212529)';

// White
export const WHITE = 'var(--mantine-color-white, #ffffff)';

// Foreground and background colors with light mode fallbacks
export const FOREGROUND = 'var(--mantine-color-foreground-0, #1A1B1E)';
export const BACKGROUND = 'var(--mantine-color-background-0, #FEFEFE)';
export const TOOLTIP_BACKGROUND = 'var(--mantine-color-background-0, #FEFEFE)';

// Axis title color (Mantine gray.6)
export const AXIS_TITLE_COLOR = 'var(--mantine-color-gray-6, #868e96)';
