import { type Document } from '@lightdash/common';
import ContentAsCodeModal from '../contentAsCode/components/ContentAsCodeModal';
import { useDocumentAsCode } from './useDocumentAsCode';

type DocumentAsCodeModalProps = {
    document: Document;
    opened: boolean;
    onClose: () => void;
};

const DocumentAsCodeModal = ({
    document,
    opened,
    onClose,
}: DocumentAsCodeModalProps) => {
    const contentAsCode = useDocumentAsCode(
        document.projectUuid,
        document.documentUuid,
        opened,
    );

    return (
        <ContentAsCodeModal
            opened={opened}
            onClose={onClose}
            resourceLabel="document"
            contentAsCode={contentAsCode}
            contentJson={
                contentAsCode.data
                    ? JSON.stringify(contentAsCode.data, null, 2)
                    : undefined
            }
            downloadFileName={document.slug}
        />
    );
};

export default DocumentAsCodeModal;
