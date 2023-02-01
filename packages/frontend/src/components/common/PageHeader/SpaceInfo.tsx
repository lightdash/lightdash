import { IconFolder } from '@tabler/icons-react';
import { FC } from 'react';
import { Link } from 'react-router-dom';
import { InfoContainer } from '.';

interface SpaceInfoProps {
    link: string;
    name: string;
}

const SpaceInfo: FC<SpaceInfoProps> = ({ link, name }) => {
    return (
        <InfoContainer>
            <IconFolder size={16} />
            <Link to={link}>{name}</Link>
        </InfoContainer>
    );
};

export default SpaceInfo;
