export {};

interface JestDomMatchers {
    toBeChecked(): void;
    toBeDisabled(): void;
    toBeEnabled(): void;
    toBeInTheDocument(): void;
    toBeVisible(): void;
    toHaveAttribute(attribute: string, value?: string | RegExp): void;
    toHaveStyle(css: string | Record<string, unknown>): void;
}

declare module '@vitest/expect' {
    interface Assertion<T = any> extends JestDomMatchers {}
}

declare module 'vitest' {
    interface Assertion<T = any> extends JestDomMatchers {}
}
