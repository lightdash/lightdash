import { render } from 'ink-testing-library';
import { ContentAsCodeSummary } from './contentAsCodeSummary';

describe('ContentAsCodeSummary', () => {
    it('renders a bordered content summary with resource outcomes', () => {
        const { lastFrame } = render(
            <ContentAsCodeSummary
                operation="upload"
                scope="organization"
                path="/tmp/lightdash"
                elapsedSeconds={1.2}
                items={[
                    {
                        label: 'Custom roles',
                        detail: '1 created, 2 unchanged',
                    },
                    { label: 'Users', detail: '4 updated' },
                    {
                        label: 'Groups',
                        detail: 'service unavailable',
                        variant: 'warning',
                    },
                ]}
            />,
        );

        const frame = lastFrame();
        expect(frame).toContain('⚡ LIGHTDASH');
        expect(frame).toContain('CONTENT AS CODE · UPLOAD');
        expect(frame).toContain('✓ Custom roles');
        expect(frame).toContain('⚠ Groups');
        expect(frame).toContain('UPLOAD COMPLETE');
        expect(frame).toContain('Read from: /tmp/lightdash');
        expect(frame).toContain('╭');
        expect(frame).toContain('╯');
    });
});
