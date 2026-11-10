import { type Document } from '@lightdash/common';
import { Button, type ButtonProps } from '@mantine/core';
import { IconFolderShare } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import SaveDocumentToSpaceModal from './SaveDocumentToSpaceModal';
import { useCanEditDocument } from './useCanEditDocument';

type Props = {
    document: Document;
    size?: ButtonProps['size'];
};

/** Shown on personal Documents to editors; saving keeps the URL and versions. */
const SaveDocumentToSpaceButton: FC<Props> = ({ document, size }) => {
    const [isOpen, setIsOpen] = useState(false);
    const canEdit = useCanEditDocument(document);
    if (document.spaceUuid !== null || !canEdit) {
        return null;
    }
    return (
        <>
            <Button
                size={size}
                leftSection={<MantineIcon icon={IconFolderShare} />}
                onClick={() => setIsOpen(true)}
            >
                Save to space
            </Button>
            {isOpen && (
                <SaveDocumentToSpaceModal
                    document={document}
                    opened
                    onClose={() => setIsOpen(false)}
                />
            )}
        </>
    );
};

export default SaveDocumentToSpaceButton;
