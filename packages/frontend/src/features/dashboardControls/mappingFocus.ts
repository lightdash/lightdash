// DOM markers that let focus move between the mapping row's chips and the
// field bar, which is portalled after the tiles
const CHIP_ATTRIBUTE = 'data-controls-chip';
const FIELD_BAR_ATTRIBUTE = 'data-controls-field-bar';
const ADD_FIELD_ATTRIBUTE = 'data-controls-add-field';
const MAPPING_ROW_ATTRIBUTE = 'data-controls-mapping-row';

export const chipMarker = (fieldId: string) => ({ [CHIP_ATTRIBUTE]: fieldId });
export const fieldBarMarker = { [FIELD_BAR_ATTRIBUTE]: '' };
export const addFieldMarker = { [ADD_FIELD_ATTRIBUTE]: '' };
export const mappingRowMarker = { [MAPPING_ROW_ATTRIBUTE]: '' };

// A ref callback: the node takes focus as it mounts, without scrolling
export const focusOnMount = (node: HTMLElement | null) =>
    node?.focus({ preventScroll: true });

export const findChip = (fieldId: string): HTMLElement | null =>
    [...document.querySelectorAll<HTMLElement>(`[${CHIP_ATTRIBUTE}]`)].find(
        (chip) => chip.getAttribute(CHIP_ATTRIBUTE) === fieldId,
    ) ?? null;

export const findSelectedChip = (): HTMLElement | null =>
    document.querySelector<HTMLElement>(
        `[${CHIP_ATTRIBUTE}][aria-pressed="true"]`,
    );

/** The bar's first enabled button, which Tab from the selected chip reaches. */
export const findFieldBarStart = (): HTMLElement | null =>
    document.querySelector<HTMLElement>(
        `[${FIELD_BAR_ATTRIBUTE}] button:not(:disabled)`,
    );

// The chip's fallbacks once it is gone: "Add a field", else the row
export const findMappingFallback = (): HTMLElement | null =>
    document.querySelector<HTMLElement>(
        `[${ADD_FIELD_ATTRIBUTE}]:not(:disabled)`,
    ) ?? document.querySelector<HTMLElement>(`[${MAPPING_ROW_ATTRIBUTE}]`);

/** Focus went with an element that left the page. */
export const isFocusLost = () =>
    document.activeElement === null || document.activeElement === document.body;
