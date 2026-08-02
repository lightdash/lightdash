import { useForm, zodResolver } from '@mantine/form';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';

describe('Mantine form v8 compatibility', () => {
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
                validate: zodResolver(schema),
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
});
