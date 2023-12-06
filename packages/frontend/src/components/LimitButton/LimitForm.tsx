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
        const max = health.data?.query.maxLimit || 5000;

        const schema = z.object({
            limit: z
                .number({
                    invalid_type_error: 'Invalid value',
                })
                .int()
                .min(1, 'Minimum value: 1')
                .max(max, `Maximum value: ${max}`),
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
                <Stack w={200}>
                    <NumberInput
                        autoFocus
                        step={100}
                        min={1}
                        required
                        label="Total rows:"
                        {...form.getInputProps('limit')}
                    />

                    <Button
                        size={'xs'}
                        type="submit"
                        disabled={!form.isValid()}
                        sx={{ alignSelf: 'flex-end' }}
                    >
                        Apply
                    </Button>
                </Stack>
            </form>
        );
    },
);

export default LimitForm;
