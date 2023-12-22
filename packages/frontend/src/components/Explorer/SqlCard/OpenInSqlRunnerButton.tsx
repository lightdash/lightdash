import { Button } from '@mantine/core';
import { IconTerminal2 } from '@tabler/icons-react';
import { FC, memo } from 'react';
import { Link } from 'react-router-dom';
import { useCompiledSql } from '../../../hooks/useCompiledSql';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from '../../common/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';

interface OpenInSqlRunnerButtonProps {
    projectUuid: string;
}

const OpenInSqlRunnerButton: FC<
    React.PropsWithChildren<OpenInSqlRunnerButtonProps>
> = memo(({ projectUuid }) => {
    const { data, isLoading, error } = useCompiledSql();
    const searchParams = new URLSearchParams({
        sql_runner: JSON.stringify({ sql: data ?? '' }),
    });

    return (
        <Button
            {...COLLAPSABLE_CARD_BUTTON_PROPS}
            component={Link}
            to={`/projects/${projectUuid}/sqlRunner?${searchParams.toString()}`}
            leftIcon={<MantineIcon icon={IconTerminal2} color="gray" />}
            disabled={isLoading || !!error}
        >
            Open in SQL Runner
        </Button>
    );
});

export default OpenInSqlRunnerButton;
