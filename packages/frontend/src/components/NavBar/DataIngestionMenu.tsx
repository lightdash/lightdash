import { Button } from '@mantine/core';
import { IconDatabaseImport } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../common/MantineIcon';

interface Props {
    projectUuid: string;
}

const DataIngestionMenu: FC<Props> = ({ projectUuid }) => {
    return (
        <Button
            variant="default"
            size="xs"
            fz="sm"
            component={Link}
            to={`/projects/${projectUuid}/data-ingestion`}

            leftIcon={<MantineIcon color="#adb5bd" icon={IconDatabaseImport} />}
        >
            Ingest
        </Button>
    );
};

export default DataIngestionMenu;
