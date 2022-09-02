import { NumericInput } from '@blueprintjs/core';
import { Classes, Popover2 } from '@blueprintjs/popover2';
import React, { FC, memo, useState } from 'react';
import {
    ApplyButton,
    GreyButton,
    Label,
    PopupWrapper,
} from './LimitButton.styles';

type Props = {
    disabled?: boolean;
    limit: number;
    onLimitChange: (value: number) => void;
};

const LimitButton: FC<Props> = memo(({ disabled, limit, onLimitChange }) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [innerLimit, setInnerLimit] = useState<number>(limit);
    return (
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
                        text="Apply"
                        intent="primary"
                        onClick={() => {
                            onLimitChange(innerLimit);
                            setIsOpen(false);
                        }}
                    />
                </PopupWrapper>
            }
            interactionKind="click"
            popoverClassName={Classes.POPOVER2_CONTENT_SIZING}
            isOpen={isOpen}
            onInteraction={setIsOpen}
            position="bottom"
            disabled={disabled}
        >
            <GreyButton
                minimal
                rightIcon="caret-down"
                text={`Limit: ${limit}`}
                disabled={disabled}
            />
        </Popover2>
    );
});

export default LimitButton;
