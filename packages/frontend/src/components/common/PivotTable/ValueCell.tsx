import { PivotValue } from '@lightdash/common';
import { useClipboard } from '@mantine/hooks';
import { FC } from 'react';
import ValueCellMenu from './ValueCellMenu';

interface ValueCellProps {
    value: PivotValue;
}

const ValueCell: FC<ValueCellProps> = ({ value }) => {
    const clipboard = useClipboard({ timeout: 500 });

    const handleCopy = () => {
        clipboard.copy(value?.formatted);
    };

    return (
        <ValueCellMenu value={value} onCopy={handleCopy}>
            <td data-copied={clipboard.copied ? true : false}>
                {value?.formatted}
            </td>
        </ValueCellMenu>
    );
};

export default ValueCell;
