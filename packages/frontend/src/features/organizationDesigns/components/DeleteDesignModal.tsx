import { type ApiOrganizationDesign } from '@lightdash/common';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';

type Props = {
    design: ApiOrganizationDesign | null;
    opened: boolean;
    isDeleting: boolean;
    onClose: () => void;
    onConfirm: () => void;
};

export const DeleteDesignModal: FC<Props> = ({
    design,
    opened,
    isDeleting,
    onClose,
    onConfirm,
}) => (
    <MantineModal
        opened={opened}
        onClose={onClose}
        variant="delete"
        title="Delete theme"
        resourceType="theme"
        resourceLabel={design?.name}
        size="md"
        onConfirm={onConfirm}
        confirmLoading={isDeleting}
    >
        {design && design.files.length > 0 && (
            <span>
                This will also delete {design.files.length}{' '}
                {design.files.length === 1 ? 'file' : 'files'} stored with this
                theme. Any content currently using this theme will keep its
                files but won&apos;t inherit future edits.
            </span>
        )}
    </MantineModal>
);
