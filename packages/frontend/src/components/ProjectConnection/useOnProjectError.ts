import { friendlyName } from '@lightdash/common';
import { type FormErrors } from '@mantine/form';
import { useTranslation } from 'react-i18next';
import useToaster from '../../hooks/toaster/useToaster';

export const useOnProjectError = () => {
    const { showToastError } = useToaster();
    const { t } = useTranslation('projectConnection');
    return (errors: FormErrors) => {
        if (!errors) {
            showToastError({
                title: t('projectErrors.formError'),
                subtitle: t('projectErrors.unexpected'),
            });
        } else {
            const errorMessages: string[] = Object.entries(errors).reduce<any>(
                (acc, [field, message]) => {
                    const parts = field.split('.');
                    if (parts.length === 1) {
                        return [...acc, message?.toString()];
                    }
                    const [section, _key] = parts;

                    return [...acc, `${friendlyName(section)}: ${message}`];
                },
                [],
            );
            showToastError({
                title: t('projectErrors.formErrors'),
                subtitle: errorMessages.join('\n\n'),
            });
        }
    };
};
