import { CompiledField } from '@lightdash/common';
import { FC, useState } from 'react';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';

interface ConditionalFormattingProps {
    numericFields: CompiledField[];
}

const ConditionalFormatting: FC<ConditionalFormattingProps> = ({
    numericFields,
}) => {
    const [activeField, setActiveField] = useState<CompiledField>();

    return (
        <>
            <FieldAutoComplete
                id="field-autocomplete"
                fields={numericFields}
                activeField={activeField}
                onChange={setActiveField}
                popoverProps={{
                    lazy: true,
                    matchTargetWidth: true,
                }}
            />
        </>
    );
};
export default ConditionalFormatting;
