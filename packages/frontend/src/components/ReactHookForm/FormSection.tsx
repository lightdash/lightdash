import { Collapse } from '@mantine/core';
import React, { FC } from 'react';

interface FormSectionProps {
    name: string; // required prop so it can receive props from <Form/>
    isOpen?: boolean;
}

const FormSection: FC<React.PropsWithChildren<FormSectionProps>> = ({
    isOpen = true,
    children,
}) => <Collapse in={isOpen}>{children}</Collapse>;

export default FormSection;
