// Marks what can be pressed without shrinking the open control's popover:
// the dashboard's tabs
export const KEEPS_POPOVER_SELECTOR = '[data-keeps-control-popover]';

// The buttons of the controls bar: pressing one while the open control has
// changes does not take its place
const GUARDED_PRESS_SELECTOR = '[data-control-guard] button';

// Whether a press lands on something that would take the open control's
// place: any button of the bar but the open control's own pill
export const isGuardedPress = (target: Element): boolean =>
    target.closest(GUARDED_PRESS_SELECTOR) !== null &&
    target.closest('[aria-pressed="true"]') === null;
