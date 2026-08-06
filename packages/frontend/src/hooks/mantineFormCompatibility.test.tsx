import { schemaResolver, useForm } from '@mantine/form';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

// Mantine 9 replaced `zodResolver` with `schemaResolver`, which validates
// asynchronously unless `{ sync: true }` is passed. All 34 call sites pass it.
// What the async default actually breaks is the synchronous reads, not
// submission: `onSubmit` still blocks once it settles, but `validate()` returns
// no errors and `isValid()` returns a truthy pending Promise. The last two
// tests pin both halves of that.

describe('Mantine form compatibility', () => {
    test('nested field updates preserve Zod validation behavior', () => {
        const schema = z.object({
            user: z.object({
                email: z.string().email('Invalid email'),
            }),
        });
        const { result } = renderHook(() =>
            useForm({
                initialValues: {
                    user: {
                        email: '',
                    },
                },
                validate: schemaResolver(schema, { sync: true }),
            }),
        );

        act(() => {
            result.current.setFieldValue('user.email', 'not-an-email');
        });
        expect(result.current.values.user.email).toBe('not-an-email');

        act(() => {
            result.current.validate();
        });
        expect(result.current.errors).toEqual({
            'user.email': 'Invalid email',
        });

        act(() => {
            result.current.setFieldValue('user.email', 'user@example.com');
            result.current.validate();
        });
        expect(result.current.errors).toEqual({});
    });

    test('onSubmit does not run the handler while values are invalid', () => {
        const schema = z.object({ email: z.string().email('Invalid email') });
        const handler = vi.fn();
        const { result } = renderHook(() =>
            useForm({
                initialValues: { email: 'not-an-email' },
                validate: schemaResolver(schema, { sync: true }),
            }),
        );

        act(() => {
            result.current.onSubmit(handler)(
                new Event(
                    'submit',
                ) as unknown as React.FormEvent<HTMLFormElement>,
            );
        });

        expect(handler).not.toHaveBeenCalled();
        expect(result.current.errors).toEqual({ email: 'Invalid email' });
    });

    test('onSubmit runs the handler once values are valid', () => {
        const schema = z.object({ email: z.string().email('Invalid email') });
        const handler = vi.fn();
        const { result } = renderHook(() =>
            useForm({
                initialValues: { email: 'user@example.com' },
                validate: schemaResolver(schema, { sync: true }),
            }),
        );

        act(() => {
            result.current.onSubmit(handler)(
                new Event(
                    'submit',
                ) as unknown as React.FormEvent<HTMLFormElement>,
            );
        });

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0]).toEqual({ email: 'user@example.com' });
    });

    test('isValid reports synchronously, so it can gate a submit button', () => {
        const schema = z.object({ name: z.string().min(1, 'Required') });
        const { result } = renderHook(() =>
            useForm({
                initialValues: { name: '' },
                validate: schemaResolver(schema, { sync: true }),
            }),
        );

        expect(result.current.isValid()).toBe(false);

        act(() => {
            result.current.setFieldValue('name', 'Jaffle');
        });

        expect(result.current.isValid()).toBe(true);
    });

    test('cross-field refinements resolve synchronously', () => {
        const schema = z
            .object({
                password: z.string().min(8, 'Too short'),
                confirm: z.string(),
            })
            .refine((v) => v.password === v.confirm, {
                message: 'Passwords must match',
                path: ['confirm'],
            });

        const { result } = renderHook(() =>
            useForm({
                initialValues: { password: 'longenough', confirm: 'different' },
                validate: schemaResolver(schema, { sync: true }),
            }),
        );

        act(() => {
            result.current.validate();
        });
        expect(result.current.errors).toEqual({
            confirm: 'Passwords must match',
        });

        act(() => {
            result.current.setFieldValue('confirm', 'longenough');
            result.current.validate();
        });
        expect(result.current.errors).toEqual({});
    });

    test('validateField reports a single field synchronously', () => {
        const schema = z.object({
            email: z.string().email('Invalid email'),
            name: z.string().min(1, 'Required'),
        });
        const { result } = renderHook(() =>
            useForm({
                initialValues: { email: 'nope', name: '' },
                validate: schemaResolver(schema, { sync: true }),
            }),
        );

        act(() => {
            result.current.validateField('email');
        });

        expect(result.current.errors).toEqual({ email: 'Invalid email' });
    });

    // The canary. Without `{ sync: true }` the synchronous reads fail open:
    // `validate()` reports no errors and `isValid()` returns a pending Promise,
    // which is truthy. The app has ~36 `disabled={!form.isValid()}` gates and
    // several `if (form.validate().hasErrors) return;` guards that would all
    // silently invert. Submission itself still blocks, so this is the accurate
    // failure mode: bad synchronous reads, not unvalidated submits.
    test('without sync the synchronous reads fail open', () => {
        const schema = z.object({ email: z.string().email('Invalid email') });
        const { result } = renderHook(() =>
            useForm({
                initialValues: { email: 'not-an-email' },
                validate: schemaResolver(schema),
            }),
        );

        let returned: { hasErrors?: boolean } | undefined;
        act(() => {
            returned = result.current.validate() as { hasErrors?: boolean };
        });

        expect(returned?.hasErrors).toBeUndefined();
        expect(result.current.errors).toEqual({});
        // Truthy, so `disabled={!form.isValid()}` would enable an invalid form.
        expect(result.current.isValid()).toBeInstanceOf(Promise);
    });

    test('async submission still blocks invalid values once it settles', async () => {
        const schema = z.object({ email: z.string().email('Invalid email') });
        const handler = vi.fn();
        const { result } = renderHook(() =>
            useForm({
                initialValues: { email: 'not-an-email' },
                validate: schemaResolver(schema),
            }),
        );

        await act(async () => {
            result.current.onSubmit(handler)(
                new Event(
                    'submit',
                ) as unknown as React.FormEvent<HTMLFormElement>,
            );
            await Promise.resolve();
        });

        expect(handler).not.toHaveBeenCalled();
        expect(result.current.errors).toEqual({ email: 'Invalid email' });
    });
});
