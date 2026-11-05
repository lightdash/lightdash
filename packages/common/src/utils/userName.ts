export const validateUserName = (name: string): boolean => !/[<>]/u.test(name);
