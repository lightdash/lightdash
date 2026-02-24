import { Title } from '@mantine-8/core';
import { type FC } from 'react';

interface Props {
    userName: string | undefined;
}

const LandingPanel: FC<Props> = ({ userName }) => {
    return (
        <Title order={3}>
            {userName ? `${userName}, what` : 'What'} will you explore today?
        </Title>
    );
};

export default LandingPanel;
