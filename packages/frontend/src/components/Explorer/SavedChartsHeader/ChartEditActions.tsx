import { Button } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import SaveChartButton, {
    type VerificationSavePrompt,
} from '../SaveChartButton';

type Props = {
    /** Forwarded to the save button. */
    disabled?: boolean;
    verificationSavePrompt?: VerificationSavePrompt;
    onSaveModalOpenChange?: (isOpen: boolean) => void;
    cancelLabel: string;
    cancelDisabled: boolean;
    onCancel: () => void;
    /** Between Cancel and the actions menu: the host's own way out. */
    trailing?: ReactNode;
    /** The host's chart actions menu. */
    children?: ReactNode;
};

/**
 * Save, Cancel and the host's way out, in the order the chart page and the
 * in-dashboard chart editor both show them while editing a chart.
 */
const ChartEditActions: FC<Props> = ({
    disabled,
    verificationSavePrompt,
    onSaveModalOpenChange,
    cancelLabel,
    cancelDisabled,
    onCancel,
    trailing,
    children,
}) => (
    <>
        <SaveChartButton
            disabled={disabled}
            onSaveModalOpenChange={onSaveModalOpenChange}
            verificationSavePrompt={verificationSavePrompt}
        />
        <Button
            variant="default"
            size="xs"
            disabled={cancelDisabled}
            onClick={onCancel}
        >
            {cancelLabel}
        </Button>
        {trailing}
        {children}
    </>
);

export default ChartEditActions;
