import { Button } from '@mantine/core';
import { IconCategory } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../common/MantineIcon';

interface Props {
    projectUuid: string;
}

const BrowseMenu: FC<Props> = ({ projectUuid }) => {
    return (
        <Button
            component={Link}
            to={`/projects/${projectUuid}/spaces`}
            variant="default"
            size="xs"
            fz="sm"
            leftIcon={<MantineIcon color="#adb5bd" icon={IconCategory} />}
        >
            Browse
        </Button>
    );
};

export default BrowseMenu;
