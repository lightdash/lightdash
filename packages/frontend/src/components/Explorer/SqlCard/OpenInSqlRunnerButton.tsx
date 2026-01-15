import { Button } from '@mantine-8/core';
import { IconTerminal2 } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import { Link } from 'react-router';
import { useCompiledSql } from '../../../hooks/useCompiledSql';
import { COLLAPSIBLE_CARD_BUTTON_PROPS } from '../../common/CollapsibleCard/constants';
import MantineIcon from '../../common/MantineIcon';

interface OpenInSqlRunnerButtonProps {
    projectUuid: string;
}

const OpenInSqlRunnerButton: FC<OpenInSqlRunnerButtonProps> = memo(
    ({ projectUuid }) => {
        const { data, isInitialLoading, error } = useCompiledSql();

        return (
            <Button
                {...COLLAPSIBLE_CARD_BUTTON_PROPS}
                component={Link}
                to={{
                    pathname: `/projects/${projectUuid}/sql-runner`,
                }}
                state={{ sql: data?.query }} // pass SQL as location state
                leftSection={
                    <MantineIcon icon={IconTerminal2} color="ldGray.7" />
                }
                disabled={isInitialLoading || !!error}
            >
                Open in SQL Runner
            </Button>
        );
    },
);

export default OpenInSqlRunnerButton;
