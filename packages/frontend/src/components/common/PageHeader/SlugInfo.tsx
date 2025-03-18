import { IconKey } from '@tabler/icons-react';
import { type FC } from 'react';

import TextCopy from '../TextCopy';
import InfoContainer from './InfoContainer';

interface SlugInfoProps {
    slug: string;
}

const SlugInfo: FC<SlugInfoProps> = ({ slug }) => {
    return (
        <InfoContainer icon={IconKey}>
            Slug:{' '}
            <div style={{ display: 'inline-block' }}>
                <TextCopy variant="code" text={slug} tooltipLabel="Copy slug" />
            </div>
        </InfoContainer>
    );
};

export default SlugInfo;
