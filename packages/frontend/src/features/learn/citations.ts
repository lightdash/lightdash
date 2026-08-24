// Citation pins in published lesson HTML (`a.cit` with `href="#fig-…"` and
// `data-hl`) light the matching `.hlbox` on their figure. The lesson ships
// this behaviour as an inline script, which never runs once the HTML is
// injected, so the player wires it here with delegated listeners.

const CLEAR_EVENTS = ['mouseout', 'focusout'] as const;
const ACTIVATE_EVENTS = ['mouseover', 'focusin'] as const;

const clearActive = (scope: HTMLElement): void => {
    scope
        .querySelectorAll('a.cit.active, .hlbox.active')
        .forEach((el) => el.classList.remove('active'));
};

const activate = (scope: HTMLElement, pin: HTMLAnchorElement): void => {
    clearActive(scope);
    pin.classList.add('active');
    const href = pin.getAttribute('href');
    const region = pin.getAttribute('data-hl');
    if (!href || !href.startsWith('#') || !region) return;
    const figure = scope.querySelector(`[id="${CSS.escape(href.slice(1))}"]`);
    const box = figure?.querySelector(`.hlbox[data-r="${CSS.escape(region)}"]`);
    if (box) box.classList.add('active');
};

const pinFrom = (event: Event): HTMLAnchorElement | null => {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    return target.closest<HTMLAnchorElement>('a.cit');
};

/**
 * Wire citation pins inside `scope`. Returns a disposer that removes the
 * listeners; call it before the scope's HTML is replaced.
 */
export const wireCitations = (scope: HTMLElement): (() => void) => {
    const onActivate = (event: Event) => {
        const pin = pinFrom(event);
        if (pin) activate(scope, pin);
    };
    const onClear = (event: Event) => {
        if (pinFrom(event)) clearActive(scope);
    };
    const onClick = (event: Event) => {
        const pin = pinFrom(event);
        if (pin) {
            event.preventDefault();
            activate(scope, pin);
            const href = pin.getAttribute('href');
            const figure =
                href && href.startsWith('#')
                    ? scope.querySelector(`[id="${CSS.escape(href.slice(1))}"]`)
                    : null;
            const reduced = window.matchMedia?.(
                '(prefers-reduced-motion: reduce)',
            ).matches;
            figure?.scrollIntoView({
                behavior: reduced ? 'auto' : 'smooth',
                block: 'center',
            });
            return;
        }
        const target = event.target;
        if (target instanceof Element && target.closest('.figwrap')) {
            clearActive(scope);
        }
    };

    ACTIVATE_EVENTS.forEach((name) => scope.addEventListener(name, onActivate));
    CLEAR_EVENTS.forEach((name) => scope.addEventListener(name, onClear));
    scope.addEventListener('click', onClick);

    return () => {
        ACTIVATE_EVENTS.forEach((name) =>
            scope.removeEventListener(name, onActivate),
        );
        CLEAR_EVENTS.forEach((name) =>
            scope.removeEventListener(name, onClear),
        );
        scope.removeEventListener('click', onClick);
        clearActive(scope);
    };
};
