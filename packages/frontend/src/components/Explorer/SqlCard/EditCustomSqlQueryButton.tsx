import { Button } from '@mantine/core';
import { IconEdit } from '@tabler/icons-react';
import { FC, memo } from 'react';
import { Link } from 'react-router-dom';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from '../../common/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';

interface Props {
    projectUuid: string;
}

const EditCustomSqlQueryButton: FC<Props> = memo(({ projectUuid }) => {
    return (
        <Button
            {...COLLAPSABLE_CARD_BUTTON_PROPS}
            component={Link}
            to={`/projects/${projectUuid}/explore/new`}
            leftIcon={<MantineIcon icon={IconEdit} color="gray" />}
        >
            Edit custom SQL query
        </Button>
    );
});

export default EditCustomSqlQueryButton;
