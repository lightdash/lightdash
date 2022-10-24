import { Tag } from '@blueprintjs/core';
import React, { FC } from 'react';
import { Props } from './index';

const LimitTag: FC<Omit<Props, 'onLimitChange'>> = ({
    disabled,
    isEditMode,
    limit,
}) => (
    <Tag
        large
        round
        minimal
        interactive={!disabled && isEditMode}
        intent="none"
        rightIcon={isEditMode ? 'caret-down' : undefined}
    >
        Limit: {limit}
    </Tag>
);

export default LimitTag;
