import { useState } from 'react';
import { ExampleSelect } from './ExampleSelect';

type CompiledSqlScope = 'with' | 'without';

const SCOPE_OPTIONS = [
    { label: 'With view:EmbedCompiledSql', value: 'with' },
    { label: 'Without view:EmbedCompiledSql', value: 'without' },
];

export function useCompiledSqlScope(
    withScopeEmbedUrl: string,
    withoutScopeEmbedUrl: string,
) {
    const [scope, setScope] = useState<CompiledSqlScope>('with');

    return {
        embedUrl:
            scope === 'without' ? withoutScopeEmbedUrl : withScopeEmbedUrl,
        isWithoutScopeAvailable: withoutScopeEmbedUrl !== '',
        scope,
        setScope,
    };
}

type CompiledSqlScopeSelectProps = {
    envVarName: string;
    isWithoutScopeAvailable: boolean;
    onChange: (scope: CompiledSqlScope) => void;
    scope: CompiledSqlScope;
};

export function CompiledSqlScopeSelect({
    envVarName,
    isWithoutScopeAvailable,
    onChange,
    scope,
}: CompiledSqlScopeSelectProps) {
    return (
        <div style={{ maxWidth: '360px', marginBottom: '20px' }}>
            <ExampleSelect
                label="Compiled SQL scope"
                value={scope}
                disabled={!isWithoutScopeAvailable}
                onChange={(value) =>
                    onChange(value === 'without' ? 'without' : 'with')
                }
                options={SCOPE_OPTIONS}
                helperText={
                    isWithoutScopeAvailable
                        ? 'Without the scope, the token write actor is an org editor and compiled SQL is hidden.'
                        : `Run generate-embed-token to set ${envVarName}.`
                }
            />
        </div>
    );
}
