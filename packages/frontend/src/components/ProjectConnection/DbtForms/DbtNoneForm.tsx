import { Callout } from '@blueprintjs/core';
import React, { FC } from 'react';

const DbtNoneForm: FC = () => (
    <>
        <Callout intent="warning" style={{ marginBottom: 20 }}>
            This project was created from the CLI. If you want to refresh dbt,
            you need to run <b>lightdash deploy</b> from your command line or
            update your dbt connection type here.
        </Callout>
    </>
);

export default DbtNoneForm;
