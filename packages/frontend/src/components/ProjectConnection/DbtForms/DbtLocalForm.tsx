import { Callout } from '@blueprintjs/core';
import { FC } from 'react';

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
            Read docs{' '}
            <a
                href="https://docs.lightdash.com/get-started/setup-lightdash/install-lightdash#2-install--launch-lightdash"
                target="_blank"
                rel="noreferrer"
            >
                here
            </a>{' '}
            to know more.
        </Callout>
    </>
);

export default DbtLocalForm;
