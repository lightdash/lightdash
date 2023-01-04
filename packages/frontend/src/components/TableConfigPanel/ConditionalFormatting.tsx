import { CompiledField } from '@lightdash/common';
import { FC, useState } from 'react';
import ColorInput from '../common/ColorInput';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';

interface ConditionalFormattingProps {
    numericFields: CompiledField[];
}

const ConditionalFormatting: FC<ConditionalFormattingProps> = ({
    numericFields,
}) => {
    const [activeField, setActiveField] = useState<CompiledField>();
    const [color, setColor] = useState<string>();

    return (
        <>
            <FieldAutoComplete
                id="numeric-field-autocomplete"
                fields={numericFields}
                activeField={activeField}
                onChange={setActiveField}
                popoverProps={{
                    lazy: true,
                    matchTargetWidth: true,
                }}
            />

            {activeField && (
                <ColorInput
                    placeholder="Enter hex color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                />
            )}
        </>
    );
};
export default ConditionalFormatting;
