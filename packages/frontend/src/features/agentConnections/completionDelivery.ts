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

export const navigateCompletionTab = (popup: Window, url: string) => {
    try {
        if (!popup.closed) popup.location.replace(url);
    } catch {
        popup.close();
    }
};
