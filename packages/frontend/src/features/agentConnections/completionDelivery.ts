export const openCompletionTab = (): Window | null => {
    let popup: Window | null = null;
    try {
        popup = window.open('', '_blank');
        if (popup) popup.opener = null;
        return popup;
    } catch {
        popup?.close();
        return null;
    }
};

// Returns whether a navigation was attempted; a closed tab is not an attempt.
export const navigateCompletionTab = (popup: Window, url: string) => {
    if (popup.closed) return false;
    try {
        popup.location.replace(url);
    } catch {
        popup.close();
    }
    return true;
};
