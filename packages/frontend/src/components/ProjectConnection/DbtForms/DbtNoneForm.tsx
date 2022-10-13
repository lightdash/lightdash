import { Callout } from '@blueprintjs/core';
import React, { FC } from 'react';

const DbtNoneForm: FC = () => (
    <>
        <Callout intent="warning" style={{ marginBottom: 20 }}>
            This project was created from CLI, refresh dbt by doing `lightdash
            deploy`
        </Callout>
    </>
);

export default DbtNoneForm;
