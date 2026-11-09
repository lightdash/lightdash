export const maskEmail = (email: string | undefined) => {
    if (!email) return null;
    const at = email.lastIndexOf('@');
    if (at <= 0) return '••••';
    return `${email[0]}••••${email.slice(at)}`;
};
