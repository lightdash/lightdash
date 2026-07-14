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
    interface Assertion<T = unknown> extends JestDomMatchers {}
}

declare module 'vitest' {
    interface Assertion<T = unknown> extends JestDomMatchers {}
}
