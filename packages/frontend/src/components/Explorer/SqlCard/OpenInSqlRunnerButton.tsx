import { FC } from 'react';
import { useCompliedSql } from '../../../hooks/useCompiledSql';
import LinkButton from '../../common/LinkButton';

interface OpenInSqlRunnerButtonProps {
    projectUuid: string;
}

const OpenInSqlRunnerButton: FC<OpenInSqlRunnerButtonProps> = ({
    projectUuid,
}) => {
    const { data, isLoading, error } = useCompliedSql();
    const searchParams = new URLSearchParams({
        sql_runner: JSON.stringify({ sql: data ?? '{}' }),
    });

    return (
        <LinkButton
            href={`/projects/${projectUuid}/sqlRunner?${searchParams.toString()}`}
            text="Open in SQL Runner"
            icon="console"
            disabled={isLoading || !!error}
            minimal
        />
    );
};

export default OpenInSqlRunnerButton;
