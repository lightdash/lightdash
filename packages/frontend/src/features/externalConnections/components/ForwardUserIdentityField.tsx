import { Switch } from '@mantine/core';
import { type FC } from 'react';

type Props = {
    value: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
};

export const ForwardUserIdentityField: FC<Props> = ({
    value,
    onChange,
    disabled,
}) => (
    <Switch
        label="Forward viewer identity"
        description="Share the viewer's email and Lightdash user ID, when available, together with the app, organization, and project IDs. Enable only for a service you trust with this information."
        checked={value}
        onChange={(event) => onChange(event.currentTarget.checked)}
        disabled={disabled}
    />
);
