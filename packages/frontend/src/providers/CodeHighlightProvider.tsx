import {
    CodeHighlightAdapterProvider,
    createHighlightJsAdapter,
} from '@mantine-8/code-highlight';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import go from 'highlight.js/lib/languages/go';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import yaml from 'highlight.js/lib/languages/yaml';
import { type FC, type PropsWithChildren } from 'react';
import '../styles/hljs-theme.css';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('go', go);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('python', python);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('yaml', yaml);
hljs.registerAliases(['tsx'], { languageName: 'typescript' });

const adapter = createHighlightJsAdapter(hljs);

const CodeHighlightProvider: FC<PropsWithChildren> = ({ children }) => (
    <CodeHighlightAdapterProvider adapter={adapter}>
        {children}
    </CodeHighlightAdapterProvider>
);

export default CodeHighlightProvider;
