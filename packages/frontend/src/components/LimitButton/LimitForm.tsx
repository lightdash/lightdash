import { Button, NumberInput, Stack } from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { forwardRef } from 'react';
import { z } from 'zod';
import useHealth from '../../hooks/health/useHealth';
import { Props } from './index';

type LimitFormProps = Pick<Props, 'limit' | 'onLimitChange'>;

const LimitForm = forwardRef<HTMLFormElement, LimitFormProps>(
    ({ limit, onLimitChange }, ref) => {
        const health = useHealth();

        const schema = z.object({
            limit: z
                .number()
                .int()
                .min(1)
                .max(health.data?.query.maxLimit || 5000),
        });

        const form = useForm({
            validate: zodResolver(schema),
            validateInputOnChange: true,
            initialValues: { limit },
        });

        if (!health.data) {
            return null;
        }

        return (
            <form
                ref={ref}
                onSubmit={form.onSubmit(({ limit: newLimit }) => {
                    onLimitChange(newLimit);
                })}
            >
                <Stack w={320}>
                    <NumberInput
                        autoFocus
                        step={100}
                        required
                        label="Total rows:"
                        {...form.getInputProps('limit')}
                    />

                    <Button type="submit" disabled={!form.isValid()}>
                        Apply
                    </Button>
                </Stack>
            </form>
        );
    },
);

export default LimitForm;
