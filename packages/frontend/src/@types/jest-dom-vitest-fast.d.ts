export {};

declare module '@vitest/expect' {
    interface Assertion<T = any> {
        toBeChecked(): void;
        toBeDisabled(): void;
        toBeEnabled(): void;
        toBeInTheDocument(): void;
        toHaveStyle(css: string | Record<string, unknown>): void;
    }
}

declare module 'vitest' {
    interface Assertion<T = any> {
        toBeChecked(): void;
        toBeDisabled(): void;
        toBeEnabled(): void;
        toBeInTheDocument(): void;
        toHaveStyle(css: string | Record<string, unknown>): void;
    }
}
