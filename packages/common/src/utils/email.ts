export const getEmailDomain = (email: string): string => {
    const domain = email.split('@')[1];
    if (!domain) {
        throw new Error(`Invalid email: ${email}`);
    }
    return domain.toLowerCase();
};
