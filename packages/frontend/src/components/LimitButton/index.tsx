import { Position } from '@blueprintjs/core';
import { Classes, Popover2, Tooltip2 } from '@blueprintjs/popover2';
import React, { FC, memo } from 'react';
import LimitForm from './LimitForm';
import LimitTag from './LimitTag';

export type Props = {
    disabled?: boolean;
    limit: number;
    isEditMode: boolean;
    onLimitChange: (value: number) => void;
};

const LimitButton: FC<Props> = memo(
    ({ disabled, isEditMode, limit, onLimitChange }) => {
        return isEditMode ? (
            <Popover2
                content={
                    <LimitForm limit={limit} onLimitChange={onLimitChange} />
                }
                popoverClassName={Classes.POPOVER2_CONTENT_SIZING}
                position={Position.BOTTOM}
                disabled={disabled}
                lazy
            >
                <LimitTag
                    limit={limit}
                    disabled={disabled}
                    isEditMode={isEditMode}
                />
            </Popover2>
        ) : (
            <Tooltip2
                content="You must be in 'edit' or 'explore' mode to update the limit"
                position={Position.BOTTOM}
            >
                <LimitTag
                    limit={limit}
                    disabled={disabled}
                    isEditMode={isEditMode}
                />
            </Tooltip2>
        );
    },
);

export default LimitButton;
