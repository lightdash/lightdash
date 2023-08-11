import { Callout } from '@blueprintjs/core';
import React, { FC } from 'react';

const DbtLocalForm: FC = () => (
    <>
        <Callout intent="warning" style={{ marginBottom: 20 }}>
            This connection type should only be used for local development.
        </Callout>
        <Callout intent="primary" style={{ marginBottom: 20 }}>
            <p>
                When using the install script, when you&apos;re asked{' '}
                <b>How do you want to setup Lightdash ?</b>, select the option{' '}
                <b>with local dbt</b> and then provide the absolute path to your
                dbt project.
            </p>
            <p>
                When using the install script, set the env var{' '}
                <b>DBT_PROJECT_DIR</b> with the absolute path to your dbt
                project.
            </p>
        </Callout>
    </>
);

export default DbtLocalForm;
