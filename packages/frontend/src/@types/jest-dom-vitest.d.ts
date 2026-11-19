import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
    interface Matchers<
        R extends void | Promise<void> = void | Promise<void>,
        T = unknown,
    > extends TestingLibraryMatchers<unknown, R> {}
}
