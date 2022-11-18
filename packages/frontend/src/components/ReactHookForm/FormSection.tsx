import { Collapse } from '@blueprintjs/core';
import React, { FC } from 'react';

interface FormSectionProps {
    name: string; // required prop so it can receive props from <Form/>
    isOpen?: boolean;
}

const FormSection: FC<FormSectionProps> = ({ isOpen = true, children }) => (
    <Collapse isOpen={isOpen} keepChildrenMounted>
        {children}
    </Collapse>
);

export default FormSection;
