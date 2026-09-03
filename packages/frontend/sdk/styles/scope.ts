/** Marks the DOM subtrees the SDK owns (inline root and portal container).
 *  Mantine's CSS variables, colour scheme and the baseline in baseline.css
 *  are all keyed on it, so nothing reaches the host page. */
export const SDK_SCOPE_CLASS = 'lightdash-sdk-scope';
export const SDK_SCOPE_SELECTOR = `.${SDK_SCOPE_CLASS}`;
