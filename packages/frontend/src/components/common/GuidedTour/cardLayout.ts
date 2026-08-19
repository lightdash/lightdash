import { assertUnreachable } from '@lightdash/common';

const VIEWPORT_MARGIN = 12;
/** Space between the spotlight and the card, enough to fit the caret. */
const CARD_GAP = 14;
const CARD_MIN_WIDTH = 340;
const CARD_MAX_WIDTH = 480;

export type CardLayout = {
    top: number;
    left: number;
    width: number;
    /** `inside` overlaps the target because it fits on neither side of it. */
    placement: 'below' | 'above' | 'inside';
    /** Caret offset from the card's left edge, aimed at the target's centre. */
    caretLeft: number;
};

/**
 * Sit the card under the target, spanning as much of the target's width as it
 * can so a wide banner doesn't get a lone card tucked in its corner. Flips
 * above when the card doesn't fit below, and overlaps the target when it fits
 * on neither side (e.g. a target as tall as the viewport, like a modal).
 */
export const cardLayout = (rect: DOMRect, cardHeight: number): CardLayout => {
    const available = window.innerWidth - VIEWPORT_MARGIN * 2;
    const width = Math.min(
        Math.max(CARD_MIN_WIDTH, rect.width),
        CARD_MAX_WIDTH,
        available,
    );
    const fitsBelow =
        rect.bottom + CARD_GAP + cardHeight + VIEWPORT_MARGIN <=
        window.innerHeight;
    const fitsAbove = rect.top - CARD_GAP - cardHeight >= VIEWPORT_MARGIN;
    const placement = fitsBelow ? 'below' : fitsAbove ? 'above' : 'inside';
    const anchoredTop = (() => {
        switch (placement) {
            case 'below':
                return rect.bottom + CARD_GAP;
            case 'above':
                return rect.top - CARD_GAP - cardHeight;
            case 'inside':
                return rect.bottom - CARD_GAP - cardHeight;
            default:
                return assertUnreachable(placement, 'Unknown card placement');
        }
    })();
    // A cropped card leaves no way to reach Next or Skip, so keep it on screen
    // whatever the target's size.
    const top = Math.max(
        VIEWPORT_MARGIN,
        Math.min(
            anchoredTop,
            window.innerHeight - cardHeight - VIEWPORT_MARGIN,
        ),
    );
    const targetCentre = rect.left + rect.width / 2;
    const left = Math.min(
        Math.max(VIEWPORT_MARGIN, targetCentre - width / 2),
        window.innerWidth - width - VIEWPORT_MARGIN,
    );
    return {
        top,
        left,
        width,
        placement,
        caretLeft: Math.min(Math.max(20, targetCentre - left), width - 20),
    };
};
