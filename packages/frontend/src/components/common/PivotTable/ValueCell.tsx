import { PivotValue } from '@lightdash/common';
import { useClipboard, useHotkeys } from '@mantine/hooks';
import { FC, useCallback, useState } from 'react';
import ValueCellMenu from './ValueCellMenu';

interface ValueCellProps {
    value: PivotValue;
}

const ValueCell: FC<ValueCellProps> = ({ value }) => {
    const clipboard = useClipboard({ timeout: 500 });
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const handleCopy = useCallback(() => {
        if (isMenuOpen) {
            clipboard.copy(value?.formatted);
        }
    }, [clipboard, value, isMenuOpen]);

    useHotkeys([['mod+c', handleCopy]]);

    return (
        <ValueCellMenu
            opened={isMenuOpen}
            onOpen={() => setIsMenuOpen(true)}
            onClose={() => setIsMenuOpen(false)}
            value={value}
            onCopy={handleCopy}
        >
            <td data-copied={clipboard.copied ? true : false}>
                {value?.formatted}
            </td>
        </ValueCellMenu>
    );
};

export default ValueCell;
