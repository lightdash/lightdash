export const getNameInitials = (name: string) =>
    name
        .split(' ')
        .map((n) => n[0])
        .join('');
