import { WarehouseTypes } from '@lightdash/common';
import {
    Accordion,
    Anchor,
    PasswordInput,
    Stack,
    TextInput,
} from '@mantine/core';
import React, { FC } from 'react';
import { useToggle } from 'react-use';
import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import FormSection from '../../ReactHookForm/FormSection';
import Input from '../../ReactHookForm/Input';
import { useProjectFormContext } from '../ProjectFormProvider';
import StartOfWeekSelect from './Inputs/StartOfWeekSelect';

export const DatabricksSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    return (
        <Input
            // this supposed to be a `schema` but changing it will break for existing customers
            name="warehouse.database"
            label="Schema"
            documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project/#database-1"
            rules={{
                required: 'Required field',
                validate: {
                    hasNoWhiteSpaces: hasNoWhiteSpaces('Schema'),
                },
            }}
            disabled={disabled}
        />
    );
};

const DatabricksForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.DATABRICKS;

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    name="warehouse.serverHostName"
                    label="Server host name"
                    description={
                        <p>
                            Check out for more details in{' '}
                            <Anchor
                                target="_blank"
                                href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#server-hostname"
                                rel="noreferrer"
                            >
                                given documentation
                            </Anchor>
                            .
                        </p>
                    }
                    required
                    disabled={disabled}
                    placeholder="xxxx.gcp.databricks.com"
                    labelProps={{ style: { marginTop: '8px' } }}
                />
                <TextInput
                    name="warehouse.httpPath"
                    label="HTTP Path"
                    description={
                        <p>
                            Check out for more details in{' '}
                            <Anchor
                                target="_blank"
                                href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#http-path"
                                rel="noreferrer"
                            >
                                given documentation
                            </Anchor>
                            .
                        </p>
                    }
                    required
                    disabled={disabled}
                    placeholder="/sql/protocolv1/o/xxxx/xxxx"
                />
                <PasswordInput
                    name="warehouse.personalAccessToken"
                    label="Personal access token"
                    description={
                        <p>
                            Check out for more details in{' '}
                            <Anchor
                                target="_blank"
                                href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#personal-access-token"
                                rel="noreferrer"
                            >
                                given documentation
                            </Anchor>
                            .
                        </p>
                    }
                    required
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    disabled={disabled}
                />
                <TextInput
                    name="warehouse.catalog"
                    label="Catalog name"
                    description="This is the catalog name."
                    disabled={disabled}
                />
                <FormSection isOpen={isOpen} name="advanced">
                    <StartOfWeekSelect disabled={disabled} />
                </FormSection>
                <Accordion
                    chevronPosition="left"
                    variant="filled"
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                    }}
                >
                    <Accordion.Item value="advanced configuration options">
                        <Accordion.Control
                            onClick={toggleOpen}
                            style={{
                                fontSize: '14px',
                                paddingRight: '2px',
                            }}
                        >
                            Advanced configuration options
                        </Accordion.Control>
                    </Accordion.Item>
                </Accordion>
            </Stack>
        </>
    );
};

export default DatabricksForm;
