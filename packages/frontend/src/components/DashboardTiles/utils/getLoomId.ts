export const getLoomId = (value: string | undefined): string | undefined => {
    const arr = value?.match(/share\/(.*)/);
    return arr?.[1];
};
