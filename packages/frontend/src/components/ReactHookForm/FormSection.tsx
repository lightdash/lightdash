import React, { FC } from 'react';
import { Collapse } from '@blueprintjs/core';

interface FormSectionProps {
    name: string; // required prop so it can receive props from <Form/>
    disabled?: boolean;
    isOpen?: boolean;
    children: JSX.Element[];
}

const FormSection: FC<FormSectionProps> = ({
    disabled,
    isOpen = true,
    children,
}) => (
    <Collapse isOpen={isOpen} keepChildrenMounted>
        {React.Children.map(children, (child) =>
            child.props.name
                ? React.createElement(child.type, {
                      ...{
                          ...child.props,
                          disabled,
                          key: child.props.name,
                      },
                  })
                : child,
        )}
    </Collapse>
);

export default FormSection;
