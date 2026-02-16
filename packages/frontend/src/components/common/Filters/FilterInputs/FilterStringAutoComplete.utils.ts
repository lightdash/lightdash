export const INLINE_RENDER_LIMIT = 50;
export const SUMMARY_MODE_THRESHOLD = 500;
export const MORE_VALUES_TOKEN = '__lightdash_more_values__';

/**
 * Computes display values for the MultiSelect component.
 * When there are more than INLINE_RENDER_LIMIT values, truncates to first N items
 * and appends a token representing the hidden items.
 */
export const computeDisplayValues = (
    values: string[],
    singleValue?: boolean,
): string[] => {
    if (singleValue) return values;
    const hiddenCount = Math.max(values.length - INLINE_RENDER_LIMIT, 0);
    if (hiddenCount <= 0) return values;
    return [...values.slice(0, INLINE_RENDER_LIMIT), MORE_VALUES_TOKEN];
};

/**
 * Computes the hidden count (values beyond the display limit).
 */
export const computeHiddenCount = (values: string[]): number =>
    Math.max(values.length - INLINE_RENDER_LIMIT, 0);

/**
 * Handles value changes from the MultiSelect, preserving hidden values when truncated.
 *
 * When values are truncated (>50 items), the MultiSelect only sees the first 50.
 * This function ensures that:
 * 1. Hidden values are preserved when adding new values
 * 2. If a user removes a displayed value, it's also removed from hidden if present
 * 3. Data loss is prevented when interacting with truncated lists
 *
 * @param updatedValues - The new values from MultiSelect onChange
 * @param displayValues - The values currently shown in MultiSelect (truncated + token)
 * @param allValues - The full list of all values (including hidden)
 * @returns The merged list preserving hidden values
 */
export const mergeWithHiddenValues = (
    updatedValues: string[],
    displayValues: string[],
    allValues: string[],
): string[] => {
    const hiddenCount = computeHiddenCount(allValues);

    // Remove the token from the updated values
    const cleaned = updatedValues.filter((v) => v !== MORE_VALUES_TOKEN);

    // If not truncated, just return cleaned values
    if (hiddenCount <= 0) {
        return cleaned;
    }

    // Get hidden values (beyond display limit)
    const hiddenValues = allValues.slice(INLINE_RENDER_LIMIT);

    // Find which displayed values were removed
    const displayedWithoutToken = displayValues.filter(
        (v) => v !== MORE_VALUES_TOKEN,
    );
    const removedFromDisplayed = displayedWithoutToken.filter(
        (v) => !cleaned.includes(v),
    );

    // Filter hidden values to exclude any that were removed
    const finalHidden = hiddenValues.filter(
        (v) => !removedFromDisplayed.includes(v),
    );

    // Merge displayed values with preserved hidden values
    return [...cleaned, ...finalHidden];
};

/**
 * Checks if a value is selected, considering the full values array.
 * This is used to fix the dropdown selection state for hidden values.
 */
export const isValueSelected = (
    itemValue: string,
    allValues: string[],
): boolean => {
    if (itemValue === MORE_VALUES_TOKEN) return false;
    return allValues.includes(itemValue);
};

/**
 * Determines if the "more values" token was removed (user pressed backspace on truncated list).
 * In this case, we should open the manage values modal instead of removing values.
 */
export const wasTokenRemoved = (
    displayValues: string[],
    updatedValues: string[],
    hiddenCount: number,
): boolean => {
    const hadToken = displayValues.includes(MORE_VALUES_TOKEN);
    const hasToken = updatedValues.includes(MORE_VALUES_TOKEN);
    return hadToken && !hasToken && hiddenCount > 0;
};
