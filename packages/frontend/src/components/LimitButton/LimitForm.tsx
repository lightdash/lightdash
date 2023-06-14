import { Button, Group, NumberInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { forwardRef } from 'react';
import useHealth from '../../hooks/health/useHealth';
import { Props } from './index';

type LimitFormProps = Pick<Props, 'limit' | 'onLimitChange'>;

const LimitForm = forwardRef<HTMLFormElement, LimitFormProps>(
    ({ limit, onLimitChange }, ref) => {
        const health = useHealth();

        const form = useForm({ initialValues: { limit } });

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
                <Group align="end">
                    <NumberInput
                        autoFocus
                        w="8xl"
                        step={100}
                        required
                        label="Total rows:"
                        min={1}
                        max={health.data.query.maxLimit}
                        {...form.getInputProps('limit')}
                    />
                    <Button type="submit">Apply</Button>
                </Group>
            </form>
        );
    },
);

export default LimitForm;
