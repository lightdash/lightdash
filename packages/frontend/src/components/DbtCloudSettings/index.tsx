import { FC } from 'react';
import { useParams } from 'react-router-dom';
import { useApp } from '../../providers/AppProvider';

const DbtCloudSettings: FC = () => {
    const { user } = useApp();
    const { projectUuid } = useParams<{ projectUuid: string }>();
};
