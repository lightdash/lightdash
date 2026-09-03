import type { PluginCreator } from 'postcss';

type ScopeDocumentRulesOptions = { scopeClass?: string };

declare const scopeDocumentRules: PluginCreator<ScopeDocumentRulesOptions> & {
    DEFAULT_SCOPE_CLASS: string;
};

export = scopeDocumentRules;
