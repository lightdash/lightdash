import { Anchor } from '@mantine/core';
import { IconFolder } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router-dom';

import { InfoContainer } from '.';

interface Props {
    space: {
        link: string;
        name: string;
    };
    dashboard?: {
        link: string;
        name: string;
    };
}

const SpaceAndDashboardInfo: FC<Props> = ({
    space: { link, name },
    dashboard,
}) => {
    return (
        <InfoContainer>
            <IconFolder size={16} />
            <Anchor component={Link} to={link}>
                {name}
            </Anchor>
            {dashboard && (
                <>
                    /
                    <Anchor component={Link} to={dashboard.link}>
                        {dashboard.name}
                    </Anchor>
                </>
            )}
        </InfoContainer>
    );
};

export default SpaceAndDashboardInfo;
