import { WarehouseTypes } from '@lightdash/common';
import { Anchor, PasswordInput, Stack, TextInput } from '@mantine/core';
import React, { type FC } from 'react';
import { useFormContext } from 'react-hook-form';
import { useToggle } from 'react-use';
import { useApp } from '../../../providers/AppProvider';
import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import FormSection from '../../ReactHookForm/FormSection';
import FormCollapseButton from '../FormCollapseButton';
import { useProjectFormContext } from '../ProjectFormProvider';
import StartOfWeekSelect from './Inputs/StartOfWeekSelect';

export const DatabricksSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { register } = useFormContext();
    const { health } = useApp();
    return (
        <TextInput
            // this supposed to be a `schema` but changing it will break for existing customers

            label="Schema"
            description={
                <p>
                    Check out for more details in{' '}
                    <Anchor
                        target="_blank"
                        href={`${health.data?.siteHelpdeskUrl}/get-started/setup-lightdash/connect-project/#database-1`}
                        rel="noreferrer"
                    >
                        given documentation
                    </Anchor>
                    .
                </p>
            }
            required
            {...register('warehouse.database', {
                validate: {
                    hasNoWhiteSpaces: hasNoWhiteSpaces('Schema'),
                },
            })}
            disabled={disabled}
        />
    );
};

const DatabricksForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { health } = useApp();
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.DATABRICKS;
    const { register } = useFormContext();

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    label="Server host name"
                    description={
                        <p>
                            Check out for more details in{' '}
                            <Anchor
                                target="_blank"
                                href={`${health.data?.siteHelpdeskUrl}/get-started/setup-lightdash/connect-project#server-hostname`}
                                rel="noreferrer"
                            >
                                given documentation
                            </Anchor>
                            .
                        </p>
                    }
                    required
                    {...register('warehouse.serverHostName', {
                        validate: {
                            hasNoWhiteSpaces:
                                hasNoWhiteSpaces('Server host name'),
                        },
                    })}
                    disabled={disabled}
                    placeholder="xxxx.gcp.databricks.com"
                    labelProps={{ style: { marginTop: '8px' } }}
                />
                <TextInput
                    label="HTTP Path"
                    description={
                        <p>
                            Check out for more details in{' '}
                            <Anchor
                                target="_blank"
                                href={`${health.data?.siteHelpdeskUrl}/get-started/setup-lightdash/connect-project#http-path`}
                                rel="noreferrer"
                            >
                                given documentation
                            </Anchor>
                            .
                        </p>
                    }
                    required
                    {...register('warehouse.httpPath', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('HTTP Path'),
                        },
                    })}
                    disabled={disabled}
                    placeholder="/sql/protocolv1/o/xxxx/xxxx"
                />
                <PasswordInput
                    {...register('warehouse.personalAccessToken')}
                    label="Personal access token"
                    description={
                        <p>
                            Check out for more details in{' '}
                            <Anchor
                                target="_blank"
                                href={`${health.data?.siteHelpdeskUrl}/get-started/setup-lightdash/connect-project#personal-access-token`}
                                rel="noreferrer"
                            >
                                given documentation
                            </Anchor>
                            .
                        </p>
                    }
                    required={requireSecrets}
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    disabled={disabled}
                />
                <TextInput
                    label="Catalog name"
                    description="This is the catalog name."
                    required
                    {...register('warehouse.catalog', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('Catalog name'),
                        },
                    })}
                    disabled={disabled}
                />
                <FormSection isOpen={isOpen} name="advanced">
                    <StartOfWeekSelect disabled={disabled} />
                </FormSection>
                <FormCollapseButton isSectionOpen={isOpen} onClick={toggleOpen}>
                    Advanced configuration options
                </FormCollapseButton>
            </Stack>
        </>
    );
};

export default DatabricksForm;
