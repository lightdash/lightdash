import { Switch } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
    value: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
};

export const ForwardUserIdentityField: FC<Props> = ({
    value,
    onChange,
    disabled,
}) => {
    const { t } = useTranslation('sync');
    return (
        <Switch
            label={t('externalConnections.forwardIdentity.label')}
            description={t('externalConnections.forwardIdentity.description')}
            checked={value}
            onChange={(event) => onChange(event.currentTarget.checked)}
            disabled={disabled}
        />
    );
};
