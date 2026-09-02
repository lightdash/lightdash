import { LearnUiProvider } from '@lightdash/learn-ui';
import { type FC, type PropsWithChildren } from 'react';
import { commonScopeSource } from './scopeSource';

export const LearnUiRoot: FC<PropsWithChildren> = ({ children }) => (
    <LearnUiProvider scopeSource={commonScopeSource}>
        <div
            style={{
                display: 'contents',
                ['--learn-accent' as string]:
                    'var(--mantine-color-ldBrandViolet-6)',
            }}
        >
            {children}
        </div>
    </LearnUiProvider>
);
