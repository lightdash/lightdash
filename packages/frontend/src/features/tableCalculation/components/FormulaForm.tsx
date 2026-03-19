import {
    type CustomFormat,
    type TableCalculationType,
} from '@lightdash/common';
import { Textarea } from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { useCallback, type FC } from 'react';

const FORMULA_PLACEHOLDER = 'e.g. SUM(field_a, field_b) or field_a + field_b';

type FormValues = {
    name: string;
    sql: string;
    formula: string;
    format: CustomFormat;
    type?: TableCalculationType;
};

type Props = {
    form: UseFormReturnType<FormValues>;
    isFullScreen: boolean;
    onCmdEnter?: () => void;
};

export const FormulaForm: FC<Props> = ({ form, isFullScreen, onCmdEnter }) => {
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                onCmdEnter?.();
            }
        },
        [onCmdEnter],
    );

    return (
        <Textarea
            placeholder={FORMULA_PLACEHOLDER}
            autosize
            minRows={isFullScreen ? 12 : 6}
            maxRows={isFullScreen ? 30 : 12}
            styles={{
                input: {
                    fontFamily: 'monospace',
                    fontSize: '13px',
                },
            }}
            onKeyDown={handleKeyDown}
            {...form.getInputProps('formula')}
        />
    );
};
