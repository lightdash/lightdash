const initialSearch = window.location.search;

export const getMobileUpsell = () => {
    const current = new URLSearchParams(window.location.search);
    const value = current.has('mobileUpsell')
        ? current.get('mobileUpsell')
        : new URLSearchParams(initialSearch).get('mobileUpsell');
    switch (value) {
        case '1':
            return 1;
        case '2':
            return 2;
        case '3':
            return 3;
        case '4':
            return 4;
        case '5':
            return 5;
        case '6':
            return 6;
        default:
            return null;
    }
};
