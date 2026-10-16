import { Button, type ButtonProps } from '@mantine/core';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';

type Props = ButtonProps & ButtonHTMLAttributes<HTMLButtonElement>;

export const AddButton = forwardRef<HTMLButtonElement, Props>((props, ref) => {
    const { t } = useTranslation('common');
    return (
        <Button
            ref={ref}
            size="compact-sm"
            variant="subtle"
            leftSection="+"
            {...props}
        >
            {t('actions.add')}
        </Button>
    );
});

AddButton.displayName = 'AddButton';
