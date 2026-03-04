import { type Space } from '@lightdash/common';
import { type FC } from 'react';
import ShareSpaceModalContent from './ShareSpaceModalContent';

export interface ShareSpaceProps {
    space: Space;
    projectUuid: string;
    opened?: boolean;
    onClose?: () => void;
}

const ShareSpaceModal: FC<ShareSpaceProps> = (props) => {
    return <ShareSpaceModalContent {...props} />;
};

export default ShareSpaceModal;
