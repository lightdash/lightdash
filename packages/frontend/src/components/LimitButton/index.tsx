import { NumericInput, Position, Tag } from '@blueprintjs/core';
import { Classes, Popover2, Tooltip2 } from '@blueprintjs/popover2';
import { FC, memo, useState } from 'react';
import { ApplyButton, Label, PopupWrapper } from './LimitButton.styles';

type Props = {
    disabled?: boolean;
    limit: number;
    isEditMode: boolean;
    onLimitChange: (value: number) => void;
};

const LimitButton: FC<Props> = memo(
    ({ disabled, isEditMode, limit, onLimitChange }) => {
        const [innerLimit, setInnerLimit] = useState<number>(limit);

        const tag = (
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

        return isEditMode ? (
            <Popover2
                content={
                    <PopupWrapper>
                        <Label label="Total rows:" inline>
                            <NumericInput
                                fill
                                min={0}
                                buttonPosition="none"
                                value={innerLimit}
                                onValueChange={setInnerLimit}
                            />
                        </Label>
                        <ApplyButton
                            className={Classes.POPOVER2_DISMISS}
                            text="Apply"
                            intent="primary"
                            onClick={() => {
                                onLimitChange(innerLimit);
                            }}
                        />
                    </PopupWrapper>
                }
                popoverClassName={Classes.POPOVER2_CONTENT_SIZING}
                position={Position.BOTTOM}
                disabled={disabled}
            >
                {tag}
            </Popover2>
        ) : (
            <Tooltip2
                content="You must be in 'edit' or 'explore' mode to update limit"
                position={Position.BOTTOM}
            >
                {tag}
            </Tooltip2>
        );
    },
);

export default LimitButton;
