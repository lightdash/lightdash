import { Button } from '@mantine/core';
import { IconTerminal2 } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import { Link } from 'react-router';
import { useCompiledSql } from '../../../hooks/useCompiledSql';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from '../../common/CollapsableCard/constants';
import MantineIcon from '../../common/MantineIcon';

interface OpenInSqlRunnerButtonProps {
    projectUuid: string;
    sql?: string | null;
    isDisabled?: boolean;
}

const OpenInSqlRunnerButton: FC<OpenInSqlRunnerButtonProps> = memo(
    ({ projectUuid, sql, isDisabled }) => {
        const shouldFetchSql = sql === undefined;
        const { data, isInitialLoading, error } = useCompiledSql({
            enabled: shouldFetchSql,
        });
        const resolvedSql = sql ?? data?.query;
        const isButtonDisabled =
            !!isDisabled ||
            (shouldFetchSql ? isInitialLoading || !!error : !resolvedSql);

        return (
            <Button
                {...COLLAPSABLE_CARD_BUTTON_PROPS}
                component={Link}
                to={{
                    pathname: `/projects/${projectUuid}/sql-runner`,
                }}
                state={{ sql: resolvedSql }} // pass SQL as location state
                leftIcon={<MantineIcon icon={IconTerminal2} color="ldGray.7" />}
                disabled={isButtonDisabled}
            >
                Open in SQL Runner
            </Button>
        );
    },
);

export default OpenInSqlRunnerButton;
