export type AiInlineHintState = {
    /** Inline ghost text appended after the prompt, or null. */
    preview: string | null;
    showTab: boolean;
    showRetry: boolean;
    showLoading: boolean;
};

/** Ghost preview + Tab/Retry keycap, rendered as editor decoration DOM. */
export const buildAiInlineHint = ({
    preview,
    showTab,
    showRetry,
    showLoading,
}: AiInlineHintState): HTMLElement | null => {
    if (!preview && !showTab && !showRetry) return null;

    const container = document.createElement('span');
    container.className = 'ai-inline-hint';
    container.setAttribute('aria-hidden', 'true');

    if (preview) {
        const ghost = document.createElement('span');
        ghost.className = 'ai-inline-preview';
        ghost.textContent = ` → ${preview}`;
        container.appendChild(ghost);
    }

    if (showTab || showRetry) {
        const classes = ['ai-inline-chip'];
        if (showRetry) classes.push('ai-inline-chip--retry');
        // Shimmer the keycap while a preview is being generated in the background.
        // Gated on !showRetry so error state stays visually still.
        if (showLoading && !preview && !showRetry) {
            classes.push('ai-inline-chip--loading');
        }
        const badge = document.createElement('kbd');
        badge.className = classes.join(' ');
        badge.textContent = showRetry ? '⇥ Retry' : '⇥ Tab';
        container.appendChild(badge);
    }

    return container;
};

/** Multi-line ghost preview, for editors that show it below the prompt line. */
export const buildAiPreviewBlock = (preview: string): HTMLElement => {
    const block = document.createElement('pre');
    block.className = 'ai-inline-preview ai-inline-preview--block';
    block.setAttribute('aria-hidden', 'true');
    block.textContent = preview;
    return block;
};
