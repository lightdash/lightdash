export const personalInstanceKey = (value: string): string => {
    try {
        const url = new URL(value);
        if (
            !/^https?:\/\/[^/?#\\\s@]+\/?$/i.test(value) ||
            !['http:', 'https:'].includes(url.protocol) ||
            url.username !== '' ||
            url.password !== '' ||
            url.pathname !== '/' ||
            url.search !== '' ||
            url.hash !== '' ||
            value.includes('?') ||
            value.includes('#')
        )
            throw new Error();
        return url.origin;
    } catch {
        throw new Error('Invalid personal login instance URL.');
    }
};
