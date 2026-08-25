export const toDate = (value: Date | string): Date =>
    value instanceof Date ? value : new Date(value);
