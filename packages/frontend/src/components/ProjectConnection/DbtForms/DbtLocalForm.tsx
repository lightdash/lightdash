import { Callout } from '@blueprintjs/core';
import React, { FC } from 'react';
import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import Input from '../../ReactHookForm/Input';

const DbtLocalForm: FC<{ disabled: boolean }> = ({ disabled }) => (
    <>
        <Callout intent="primary" style={{ marginBottom: 20 }}>
            This connection type should only be used for local development. Read
            docs{' '}
            <a
                href="https://docs.lightdash.com/get-started/setup-lightdash/install-lightdash#2-install--launch-lightdash"
                target="_blank"
                rel="noreferrer"
            >
                here
            </a>{' '}
            to know more.
        </Callout>
        <Input
            name="dbt.project_dir"
            label="Project directory"
            documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#local-dbt-project"
            rules={{
                required: 'Required field',
                validate: {
                    hasNoWhiteSpaces: hasNoWhiteSpaces('Project directory'),
                },
            }}
            disabled={disabled}
        />
    </>
);

export default DbtLocalForm;
