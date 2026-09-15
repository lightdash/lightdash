export type LauncherPanelSize = { width: number; height: number };

export const LAUNCHER_PANEL_MIN_SIZE: LauncherPanelSize = {
    width: 360,
    height: 400,
};

export const LAUNCHER_PANEL_KEYBOARD_STEP = 16;

const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), Math.max(min, max));

export const clampLauncherPanelSize = (
    size: LauncherPanelSize,
    available: LauncherPanelSize,
): LauncherPanelSize => ({
    width: Math.round(
        clamp(size.width, LAUNCHER_PANEL_MIN_SIZE.width, available.width),
    ),
    height: Math.round(
        clamp(size.height, LAUNCHER_PANEL_MIN_SIZE.height, available.height),
    ),
});

const isPositiveNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;

export const parseLauncherPanelSize = (
    raw: string | undefined,
): LauncherPanelSize | null => {
    if (!raw) return null;
    try {
        const value: unknown = JSON.parse(raw);
        if (typeof value !== 'object' || value === null) return null;
        const { width, height } = value as Record<string, unknown>;
        return isPositiveNumber(width) && isPositiveNumber(height)
            ? { width, height }
            : null;
    } catch {
        return null;
    }
};
