// Where focus goes as the editor's parts mount; without scrolling, as the
// popover is still being placed. The first target is marked
// `data-autofocus` too: the popover's focus trap hands focus to it

// The first value input that can take focus, else the operator. A typed
// input that owns a list opens it on focus, over the footer, unless its list
// stays shut on focus, so it is skipped
const focusValue = (node: HTMLElement | null, isListShutOnFocus: boolean) => {
    // Under an open question, which holds the focus (an inert node takes none)
    if (node?.closest('[inert]')) return;
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
        ) ?? node?.querySelector<HTMLElement>('[data-controls-operator]');
    input?.setAttribute('data-autofocus', '');
    input?.focus({ preventScroll: true });
};

export const focusValueOnMount = (node: HTMLElement | null) =>
    focusValue(node, false);

/** A text value's list stays shut on focus, so the input itself takes it. */
export const focusStringValueOnMount = (node: HTMLElement | null) =>
    focusValue(node, true);

/** The question takes focus as it appears: Apply, else Discard. */
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

/** A new filter starts at its field search. */
export const focusStartOnMount = (node: HTMLElement | null) => {
    const input = node?.querySelector<HTMLElement>(
        '[data-controls-start] input',
    );
    input?.setAttribute('data-autofocus', '');
    input?.focus({ preventScroll: true });
};

/** Focus the parameter value without opening its options. */
export const focusParameterValueOnMount = (node: HTMLElement | null) => {
    const input = node?.querySelector<HTMLInputElement>(
        'input:not([type="hidden"]):not(:disabled)',
    );
    input?.setAttribute('data-autofocus', '');
    input?.focus({ preventScroll: true });
};
