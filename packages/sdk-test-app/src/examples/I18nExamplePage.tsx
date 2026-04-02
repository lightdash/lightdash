import Lightdash from '@lightdash/sdk';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SavedChart } from '../../../common/src';
import { ExampleLayout } from '../components/ExampleLayout';
import type { EmbedConfigState } from '../hooks/useEmbedConfig';
import { getRepoSourceUrl } from '../lib/repo';
import {
    buttonSecondaryStyle,
    buttonStyle,
    chartContainerStyle,
    controlsStyle,
    infoBoxStyle,
    inputStyle,
    labelStyle,
    langButtonStyle,
    sectionDescStyle,
    sectionTitleStyle,
    singleChartContainerStyle,
} from './I18nExamplePage.styles';
import { emptyStateBoxStyle, emptyStateStyle, monoFontFamily } from '../styles';

type I18nExamplePageProps = {
    embedConfig: EmbedConfigState;
};
const CHART_ID_STORAGE_KEY = 'sdkTestApp.chartUuidOrSlug';
const sourceUrl = getRepoSourceUrl(
    'packages/sdk-test-app/src/examples/I18nExamplePage.tsx',
);

export function I18nExamplePage({ embedConfig }: I18nExamplePageProps) {
    const { t, i18n } = useTranslation();
    const [savedChart, setSavedChart] = useState<SavedChart | null>(null);
    const chartIdRef = useRef<HTMLInputElement>(null);
    const [chartUuidOrSlug, setChartUuidOrSlug] = useState<string>(
        localStorage.getItem(CHART_ID_STORAGE_KEY) || '',
    );

    useEffect(() => {
        setSavedChart(null);
    }, [embedConfig.remountKey]);

    const controls = (
        <div style={controlsStyle}>
            <button
                style={langButtonStyle(i18n.language === 'en')}
                onClick={() => i18n.changeLanguage('en')}
            >
                🇬🇧 EN
            </button>
            <button
                style={langButtonStyle(i18n.language === 'ka')}
                onClick={() => i18n.changeLanguage('ka')}
            >
                🇬🇪 KA
            </button>
            <button
                style={langButtonStyle(i18n.language === 'es')}
                onClick={() => i18n.changeLanguage('es')}
            >
                🇪🇸 ES
            </button>
        </div>
    );

    return (
        <ExampleLayout
            embedConfig={embedConfig}
            controls={controls}
            sourceUrl={sourceUrl}
            title="I18n demo"
            description="This keeps the current SDK test flow intact: translated dashboard content overrides, dashboard-to-explore navigation, and a standalone chart example driven by the same embed token."
        >
            {embedConfig.instanceUrl && embedConfig.token ? (
                <>
                    <section>
                        <h3 style={sectionTitleStyle}>
                            {t('Dashboard component')}
                        </h3>
                        <p style={sectionDescStyle}>
                            {t(
                                'app.intro',
                                'Embedded Lightdash dashboard component. Data fetched from your Lightdash instance.',
                            )}
                        </p>

                        {savedChart && (
                            <button
                                style={{
                                    ...buttonSecondaryStyle,
                                    marginBottom: '16px',
                                }}
                                onClick={() => setSavedChart(null)}
                            >
                                ← Back to dashboard
                            </button>
                        )}

                        <div style={chartContainerStyle}>
                            {savedChart ? (
                                <Lightdash.Explore
                                    key={`${embedConfig.remountKey}:${savedChart.uuid}`}
                                    instanceUrl={embedConfig.instanceUrl}
                                    token={embedConfig.token}
                                    exploreId={savedChart.tableName}
                                    savedChart={savedChart}
                                />
                            ) : (
                                <Lightdash.Dashboard
                                    key={`${embedConfig.remountKey}:${i18n.language}`}
                                    instanceUrl={embedConfig.instanceUrl}
                                    token={embedConfig.token}
                                    styles={{
                                        backgroundColor: 'transparent',
                                    }}
                                    contentOverrides={i18n.getResourceBundle(
                                        i18n.language,
                                        'translation',
                                    )}
                                    onExplore={({ chart }) =>
                                        setSavedChart(chart)
                                    }
                                />
                            )}
                        </div>

                        <div style={infoBoxStyle}>
                            <code style={{ fontFamily: monoFontFamily }}>
                                {t('ℹ Powered by Lightdash SDK')}
                            </code>
                        </div>
                    </section>

                    <section>
                        <h3 style={sectionTitleStyle}>{t('Chart component')}</h3>
                        <p style={sectionDescStyle}>
                            {t('Render a single chart by UUID or slug.')}
                        </p>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={labelStyle}>Chart UUID or Slug</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    defaultValue={chartUuidOrSlug}
                                    ref={chartIdRef}
                                    placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                                    style={{ ...inputStyle, flexGrow: 1 }}
                                />
                                <button
                                    style={buttonStyle}
                                    onClick={() => {
                                        const value =
                                            chartIdRef.current?.value || '';
                                        setChartUuidOrSlug(value);
                                        localStorage.setItem(
                                            CHART_ID_STORAGE_KEY,
                                            value,
                                        );
                                    }}
                                >
                                    {t('Load')}
                                </button>
                                <button
                                    style={buttonSecondaryStyle}
                                    onClick={() => {
                                        setChartUuidOrSlug('');
                                        localStorage.removeItem(
                                            CHART_ID_STORAGE_KEY,
                                        );

                                        if (chartIdRef.current) {
                                            chartIdRef.current.value = '';
                                        }
                                    }}
                                >
                                    {t('Clear')}
                                </button>
                            </div>
                        </div>

                        <div style={singleChartContainerStyle}>
                            {chartUuidOrSlug ? (
                                <Lightdash.Chart
                                    key={`${embedConfig.remountKey}:${chartUuidOrSlug}`}
                                    instanceUrl={embedConfig.instanceUrl}
                                    token={embedConfig.token}
                                    styles={{
                                        backgroundColor: 'transparent',
                                    }}
                                    id={chartUuidOrSlug}
                                />
                            ) : (
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        height: '100%',
                                        color: '#a3a3a3',
                                        fontFamily: monoFontFamily,
                                        fontSize: '13px',
                                    }}
                                >
                                    {t('Enter a chart ID above')}
                                </div>
                            )}
                        </div>
                    </section>
                </>
            ) : (
                <div style={emptyStateStyle}>
                    <div style={emptyStateBoxStyle}>
                        Click <strong>Config</strong> to add your embed URL
                    </div>
                </div>
            )}
        </ExampleLayout>
    );
}
