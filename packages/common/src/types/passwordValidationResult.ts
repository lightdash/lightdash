export type PasswordValidationResult = {
    isLengthValid: boolean;
    hasLetter: boolean;
    hasNumberOrSymbol: boolean;
    isPasswordValid: boolean;
};
