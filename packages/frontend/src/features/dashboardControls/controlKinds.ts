import {
    DATE_ZOOM_PILL_ACTION_SELECTOR,
    DATE_ZOOM_PILL_SELECTOR,
} from './dateZoomControls';
import {
    PARAMETER_PILL_ACTION_SELECTOR,
    PARAMETER_PILL_SELECTOR,
} from './parameterControlsBar';

export const ADD_SELECTOR =
    '[data-filter-actions] > button[data-dashboard-filter-control]';
export type ControlKind = 'filter' | 'parameter' | 'dateZoom';

export const PILL_SELECTORS: Record<
    ControlKind,
    { pill: string; action: string }
> = {
    filter: { pill: '[data-controls-pill]', action: '' },
    parameter: {
        pill: PARAMETER_PILL_SELECTOR,
        action: PARAMETER_PILL_ACTION_SELECTOR,
    },
    dateZoom: {
        pill: DATE_ZOOM_PILL_SELECTOR,
        action: DATE_ZOOM_PILL_ACTION_SELECTOR,
    },
};

const otherKinds = (kind: ControlKind) =>
    (Object.keys(PILL_SELECTORS) as ControlKind[]).filter(
        (other) => other !== kind,
    );

/** The other kinds' pills and their X: one editor open at a time, so each switches away. A new kind joins here. */
export const getOtherPillsSelector = (kind: ControlKind) =>
    otherKinds(kind)
        .flatMap((other) => {
            const { pill, action } = PILL_SELECTORS[other];
            return action === '' ? [pill] : [pill, action];
        })
        .join(', ');
