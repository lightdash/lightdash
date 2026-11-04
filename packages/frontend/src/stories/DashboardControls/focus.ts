// The parameter prototype's focus: the first enabled input, even one whose
// list opens on focus, as a parameter's value is its whole popover
export const focusInputOnMount = (node: HTMLElement | null) => {
    const input = node?.querySelector<HTMLInputElement>(
        'input:not([type="hidden"]):not(:disabled)',
    );
    input?.setAttribute('data-autofocus', '');
    input?.focus({ preventScroll: true });
};
