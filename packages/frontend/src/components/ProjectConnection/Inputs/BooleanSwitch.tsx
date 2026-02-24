import {
    Group,
    Input,
    Stack,
    Switch,
    Text,
    type SwitchProps,
} from '@mantine-8/core';
import { type FC } from 'react';
import DocumentationHelpButton from '../../DocumentationHelpButton';
import { type FormInputProps } from '../formContext';

type BooleanSwitchProps = SwitchProps & {
    documentationUrl?: string;
} & FormInputProps;

const BooleanSwitch: FC<BooleanSwitchProps> = ({
    documentationUrl,
    label,
    className,
    required,
    description,
    ...rest
}) => {
    const requiredLabel = required ? '*' : '';

    return (
        <Stack className={`input-wrapper ${className}`} gap="two">
            <Group gap="xs" justify="space-between">
                <Text fw={450} fz="sm">
                    {label} <span style={{ flex: 1 }}>{requiredLabel}</span>
                </Text>

                {documentationUrl && (
                    <DocumentationHelpButton href={documentationUrl} />
                )}
            </Group>
            {description && (
                <Input.Description mb="10px">{description}</Input.Description>
            )}
            <Switch {...rest} required={required} />
        </Stack>
    );
};

export default BooleanSwitch;
