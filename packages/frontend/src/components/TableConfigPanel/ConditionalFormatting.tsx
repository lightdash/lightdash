import { CompiledField } from '@lightdash/common';
import { FC } from 'react';

interface ConditionalFormattingProps {
    numericFields: CompiledField[];
}

const ConditionalFormatting: FC<ConditionalFormattingProps> = ({
    numericFields,
}) => {
    console.log(numericFields);
    return <>test</>;
};
export default ConditionalFormatting;
