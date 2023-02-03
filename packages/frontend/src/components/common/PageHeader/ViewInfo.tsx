import { IconEye } from '@tabler/icons-react';
import { FC } from 'react';
import { InfoContainer } from '.';

interface ViewInfoProps {
    views?: number;
}

const ViewInfo: FC<ViewInfoProps> = ({ views }) => {
    return (
        <InfoContainer>
            <IconEye size={16} />
            <span>{views || '0'} views</span>
        </InfoContainer>
    );
};

export default ViewInfo;
