// Focus helpers shared by the prototype's popovers and menus; copies of
// unexported shipped helpers, named after where they come from

// From `FilterSettings.tsx` (`focusValue`): the value input, else the first
// enabled input or control. The shipped one tries `inputs[1]` first because
// its operator select is `inputs[0]`; here the operator is a button, so the
// value input is `inputs[0]`. Any other typed input that owns a list opens it
// on focus, over the footer, unless its list stays shut on focus
const focusValue = (node: HTMLElement | null, isListShutOnFocus: boolean) => {
    const inputs = [
        ...(node?.querySelectorAll<HTMLInputElement>(
            'input:not([type="hidden"])',
        ) ?? []),
    ];
    const input =
        inputs.find(
            (candidate) =>
                !candidate.disabled &&
                (isListShutOnFocus ||
                    candidate.readOnly ||
                    candidate.closest('[aria-haspopup]') === null),
        ) ?? node?.querySelector<HTMLElement>('button:not(:disabled)');
    // For the popover's focus trap, which focuses it once it is placed
    input?.setAttribute('data-autofocus', '');
    input?.focus({ preventScroll: true });
};

/** From `FilterSettings.tsx`. */
export const focusValueOnMount = (node: HTMLElement | null) =>
    focusValue(node, false);

/** From `FilterSettings.tsx`: a text value's list stays shut on focus
 * (`isListClosedOnPick`), so the value input itself takes focus. */
export const focusStringValueOnMount = (node: HTMLElement | null) =>
    focusValue(node, true);

/** The first enabled input, even one whose list opens on focus: a
 * parameter's value is its whole popover, so its list may open at once. */
export const focusInputOnMount = (node: HTMLElement | null) => {
    const input = node?.querySelector<HTMLInputElement>(
        'input:not([type="hidden"]):not(:disabled)',
    );
    input?.setAttribute('data-autofocus', '');
    input?.focus({ preventScroll: true });
};

/** From `FilterEditor.tsx`: Apply, else Discard. */
export const focusAnswerOnMount = (node: HTMLElement | null) => {
    const buttons = [
        ...(node?.querySelectorAll<HTMLButtonElement>('button') ?? []),
    ];
    (
        buttons.find(
            (button) =>
                !button.disabled && button.dataset.controlsApply !== undefined,
        ) ?? buttons[0]
    )?.focus({ preventScroll: true });
};

/** From `FilterEditor.tsx`: a new control's search takes focus. */
export const focusStartOnMount = (node: HTMLElement | null) => {
    const input = node?.querySelector<HTMLElement>(
        '[data-controls-start] input',
    );
    input?.setAttribute('data-autofocus', '');
    input?.focus({ preventScroll: true });
};
