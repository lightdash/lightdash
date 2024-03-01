import { Button } from '@mantine/core';
import { IconTerminal2 } from '@tabler/icons-react';
import { FC, memo } from 'react';
import { Link } from 'react-router-dom';
import { useCustomCompiledSql } from '../../../hooks/useCustomCompiledSql';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from '../../common/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';

interface Props {
    projectUuid: string;
}

const OpenInCustomExplore: FC<Props> = memo(({ projectUuid }) => {
    const { data, isInitialLoading, error } = useCustomCompiledSql();

    const searchParams = new URLSearchParams({
        query: data ? btoa(data) : '',
    });

    return (
        <Button
            {...COLLAPSABLE_CARD_BUTTON_PROPS}
            component={Link}
            to={`/projects/${projectUuid}/explore/new?${searchParams.toString()}`}
            leftIcon={<MantineIcon icon={IconTerminal2} color="gray" />}
            disabled={isInitialLoading || !!error}
        >
            Open in SQL Runner
        </Button>
    );
});

export default OpenInCustomExplore;
