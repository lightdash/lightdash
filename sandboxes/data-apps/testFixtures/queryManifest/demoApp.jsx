import React, { useMemo } from 'react';
import { compose, query, savedChart, useLightdash } from '@lightdash/query-sdk';
import { PlaysChart } from './charts';
import {
    Card,
    Delta,
    ErrorState,
    Skeleton,
    avatarStyle,
    colorFor,
    fmtCompact,
    fmtMoney,
    fmtMoney2,
    fmtMonth,
    fmtPct,
    fmtPlays,
    initials,
    num,
    pick,
} from './lib';

// Demo vocabulary: an order is a "play", a customer is an "artist", and the
// order amount is the royalty paid for that play.

// ---------------------------------------------------------------------------
// Headline stats — plain semantic layer queries, one card each.
// ---------------------------------------------------------------------------
const totalPlays = query('orders')
    .id('total-plays')
    .label('Total plays')
    .description('All-time number of plays (orders).')
    .metrics(['unique_order_count'])
    .limit(1);

const activeArtists = query('orders')
    .id('active-artists')
    .label('Artists streamed')
    .description('Distinct artists (customers) with at least one play.')
    .metrics(['customers.unique_customer_count'])
    .limit(1);

const royaltiesPaid = query('orders')
    .id('royalties-paid')
    .label('Royalties paid')
    .description('Total royalties (order amount) paid out across all plays.')
    .metrics(['total_order_amount'])
    .limit(1);

const royaltyPerPlay = query('orders')
    .id('royalty-per-play')
    .label('Royalty per play')
    .description('Average royalty (order amount) earned per play.')
    .metrics(['average_order_amount'])
    .limit(1);

// ---------------------------------------------------------------------------
// Plays over time — semantic → DuckDB (month-over-month + rolling average).
// ---------------------------------------------------------------------------
const playsOverTime = compose('plays-over-time')
    .title('Plays over time')
    .description('Monthly plays and royalties with month-over-month change and a 3-month rolling average.')
    .semantic(
        'monthly_plays',
        query('orders')
            .dimensions(['order_date_month'])
            .metrics(['unique_order_count', 'total_order_amount'])
            .sorts([{ field: 'order_date_month', direction: 'asc' }])
            .limit(500),
        { title: 'Monthly plays', description: 'Plays and royalties per month from the semantic layer.' },
    )
    .duckdb(
        'trend',
        `select
            orders_order_date_month as month,
            orders_unique_order_count as plays,
            orders_total_order_amount as royalties,
            orders_unique_order_count - lag(orders_unique_order_count) over (order by orders_order_date_month) as plays_change,
            round(100.0 * (orders_unique_order_count - lag(orders_unique_order_count) over (order by orders_order_date_month))
                / nullif(lag(orders_unique_order_count) over (order by orders_order_date_month), 0), 1) as plays_change_pct,
            avg(orders_unique_order_count) over (order by orders_order_date_month rows between 2 preceding and current row) as plays_3mo_avg
        from monthly_plays
        order by month`,
        {
            reads: ['monthly_plays'],
            title: 'Trend with rolling average',
            description: 'Adds month-over-month change and a 3-month rolling average of plays.',
        },
    )
    .terminal('trend');

// ---------------------------------------------------------------------------
// Top artists — semantic (joined customers) → DuckDB (rank + share of plays).
// ---------------------------------------------------------------------------
const topArtists = compose('top-artists')
    .title('Top artists')
    .description('Artists ranked by plays, with their share of all plays and royalties earned.')
    .semantic(
        'artist_plays',
        query('orders')
            .dimensions(['customers.first_name', 'customers.last_name'])
            .metrics(['unique_order_count', 'total_order_amount'])
            .limit(500),
        { title: 'Plays per artist', description: 'Plays and royalties grouped by artist name.' },
    )
    .duckdb(
        'ranked',
        `select
            trim(coalesce(customers_first_name, '') || ' ' || coalesce(customers_last_name, '')) as artist,
            orders_unique_order_count as plays,
            orders_total_order_amount as royalties,
            row_number() over (order by orders_unique_order_count desc, orders_total_order_amount desc) as rank,
            round(100.0 * orders_unique_order_count / sum(orders_unique_order_count) over (), 1) as play_share
        from artist_plays
        order by rank
        limit 10`,
        {
            reads: ['artist_plays'],
            title: 'Top 10 by plays',
            description: 'Ranks artists and computes each one’s share of total plays.',
        },
    )
    .terminal('ranked');

// ---------------------------------------------------------------------------
// Plays by platform — plain query on the order source.
// ---------------------------------------------------------------------------
const playsByPlatform = query('orders')
    .id('plays-by-platform')
    .label('Plays by platform')
    .description('Where plays come from (order source).')
    .dimensions(['order_source'])
    .metrics(['unique_order_count'])
    .sorts([{ field: 'unique_order_count', direction: 'desc' }])
    .limit(8);

// ---------------------------------------------------------------------------
// Breakout months — semantic + saved chart → Python (z-score outliers).
// ---------------------------------------------------------------------------
const SAVED_CHART_UUID = 'dcfeaf86-4d9b-4b82-b125-fc3b22ef045e'; // "orders area month"

const breakoutMonths = compose('breakout-months')
    .title('Breakout months')
    .description('Months where plays spiked well above the long-run average, scored in Python.')
    .semantic(
        'monthly',
        query('orders')
            .dimensions(['order_date_month'])
            .metrics(['unique_order_count'])
            .limit(500),
        { title: 'Monthly plays', description: 'Plays per month.' },
    )
    .semantic('catalog', savedChart(SAVED_CHART_UUID), {
        title: 'Catalog chart (saved)',
        description: 'A saved chart used as a second input, to show saved charts can feed a pipeline.',
    })
    .python(
        'spikes',
        `def run(inputs, params):
    df = inputs['monthly'].rename(columns={
        'orders_order_date_month': 'month',
        'orders_unique_order_count': 'plays',
    })
    std = df['plays'].std() or 1.0
    df['z'] = (df['plays'] - df['plays'].mean()) / std
    df['catalog_rows'] = len(inputs['catalog'])
    out = df[df['z'] > 0.75].sort_values('plays', ascending=False).head(6)
    return out[['month', 'plays', 'z', 'catalog_rows']]`,
        {
            reads: ['monthly', 'catalog'],
            title: 'Z-score spikes',
            description: 'Flags months more than 0.75 standard deviations above the mean.',
        },
    )
    .terminal('spikes');

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------
function Stat({ q, label, field, format, sub }) {
    const { data, loading, error, lineage } = useLightdash(q);
    const value = data[0] ? pick(data[0], field, field.replace('.', '_'), field.split('.').pop()) : null;
    return (
        <div className="stat" {...lineage}>
            <div className="stat-label">{label}</div>
            {loading ? (
                <Skeleton h={34} w="60%" style={{ marginTop: 10 }} />
            ) : error ? (
                <div className="stat-value" style={{ fontSize: 14, color: 'var(--red)' }}>Unavailable</div>
            ) : (
                <div className="stat-value">{format(value)}</div>
            )}
            {sub ? <div className="stat-sub">{sub}</div> : null}
        </div>
    );
}

function PlaysOverTime() {
    const { data, loading, error, lineage } = useLightdash(playsOverTime);
    const points = useMemo(
        () =>
            data.map((r) => ({
                month: pick(r, 'month'),
                plays: num(pick(r, 'plays')),
                royalties: num(pick(r, 'royalties')),
                change: num(pick(r, 'plays_change')),
                changePct: num(pick(r, 'plays_change_pct')),
                avg: num(pick(r, 'plays_3mo_avg')),
            })),
        [data],
    );
    const last = points[points.length - 1];
    return (
        <Card
            title="Plays over time"
            desc="Monthly plays with a 3-month rolling average"
            lineage={lineage}
            right={last ? <Delta value={last.changePct} suffix="% MoM" /> : null}
        >
            {loading ? (
                <Skeleton h={260} />
            ) : error ? (
                <ErrorState error={error} />
            ) : (
                <>
                    <PlaysChart points={points} />
                    {last ? (
                        <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 10 }}>
                            Latest month <b style={{ color: '#fff' }}>{fmtMonth(last.month)}</b>: {fmtPlays(last.plays)} plays
                            {last.royalties !== null ? <>, {fmtMoney(last.royalties)} in royalties</> : null}.
                        </div>
                    ) : null}
                </>
            )}
        </Card>
    );
}

function TopArtists() {
    const { data, loading, error, lineage } = useLightdash(topArtists);
    const rows = data.map((r) => ({
        artist: pick(r, 'artist') || 'Unknown artist',
        plays: num(pick(r, 'plays')),
        royalties: num(pick(r, 'royalties')),
        rank: num(pick(r, 'rank')),
        share: num(pick(r, 'play_share')),
    }));
    const max = Math.max(1, ...rows.map((r) => r.plays ?? 0));
    return (
        <Card title="Top artists" desc="Ranked by plays · share of all plays" lineage={lineage} style={{ gridRow: 'span 2' }}>
            {loading ? (
                <div style={{ display: 'grid', gap: 12 }}>
                    {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} h={40} />)}
                </div>
            ) : error ? (
                <ErrorState error={error} />
            ) : (
                <div className="rank-list">
                    {rows.map((r, i) => (
                        <div className="rank-row" key={r.artist + i}>
                            <div className="rank-n">{r.rank ?? i + 1}</div>
                            <div className="avatar" style={avatarStyle(i)}>{initials(r.artist)}</div>
                            <div style={{ minWidth: 0 }}>
                                <div className="rank-name">{r.artist}</div>
                                <div className="rank-sub">
                                    <span className="bar-track"><span className="bar-fill" style={{ width: `${((r.plays ?? 0) / max) * 100}%` }} /></span>
                                    <span>{fmtPct(r.share)} of plays</span>
                                </div>
                            </div>
                            <div className="rank-val">
                                {fmtPlays(r.plays)}
                                <small>{fmtMoney(r.royalties)}</small>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}

function PlaysByPlatform() {
    const { data, loading, error, lineage } = useLightdash(playsByPlatform);
    const rows = data.map((r) => ({
        name: pick(r, 'order_source') ?? 'Unknown',
        plays: num(pick(r, 'unique_order_count')) ?? 0,
    }));
    const total = rows.reduce((s, r) => s + r.plays, 0) || 1;
    return (
        <Card title="Plays by platform" desc="Share of plays by source" lineage={lineage}>
            {loading ? (
                <Skeleton h={120} />
            ) : error ? (
                <ErrorState error={error} />
            ) : (
                <>
                    <div className="seg-bar">
                        {rows.map((r, i) => (
                            <span key={r.name} className="seg" style={{ width: `${(r.plays / total) * 100}%`, background: colorFor(i) }} title={r.name} />
                        ))}
                    </div>
                    {rows.map((r, i) => (
                        <div className="plat-row" key={r.name}>
                            <span className="plat-name"><span className="swatch" style={{ background: colorFor(i) }} />{String(r.name)}</span>
                            <span className="plat-val"><b>{fmtPlays(r.plays)}</b>{fmtPct((r.plays / total) * 100)}</span>
                        </div>
                    ))}
                </>
            )}
        </Card>
    );
}

function BreakoutMonths() {
    const { data, loading, error, lineage } = useLightdash(breakoutMonths);
    const rows = data.map((r) => ({
        month: pick(r, 'month'),
        plays: num(pick(r, 'plays')),
        z: num(pick(r, 'z')),
    }));
    return (
        <Card
            title="Breakout months"
            desc="Spikes above the long-run average, scored in a Python step"
            lineage={lineage}
            right={<span className="pill">Python</span>}
        >
            {loading ? (
                <div className="month-chips">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h={58} w={130} />)}</div>
            ) : error ? (
                <ErrorState error={error} hint="The Python sandbox may be unavailable; the rest of the page still works." />
            ) : rows.length === 0 ? (
                <div style={{ color: 'var(--muted)' }}>No breakout months yet.</div>
            ) : (
                <div className="month-chips">
                    {rows.map((r) => (
                        <div className="month-chip" key={String(r.month)}>
                            <b>{fmtMonth(r.month)}</b>
                            <span>{fmtPlays(r.plays)} plays · <span className="z">+{(r.z ?? 0).toFixed(1)}σ</span></span>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function App() {
    return (
        <div className="page">
            <div className="wrap">
                <header className="hero">
                    <div className="hero-art" aria-hidden>
                        <svg viewBox="0 0 24 24" fill="none">
                            <path d="M9 18V6l10-2v12" stroke="#0b0b0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <circle cx="6.5" cy="18" r="2.5" fill="#0b0b0b" />
                            <circle cx="16.5" cy="16" r="2.5" fill="#0b0b0b" />
                        </svg>
                    </div>
                    <div>
                        <div className="hero-kicker">Streaming overview</div>
                        <h1 className="hero-title">Jaffle Records</h1>
                        <div className="hero-meta">
                            <b>Plays &amp; royalties</b>
                            <span className="dot">Semantic layer + DuckDB + Python pipelines</span>
                            <span className="dot">Live data</span>
                        </div>
                    </div>
                </header>

                <div className="stats">
                    <Stat q={totalPlays} label="Total plays" field="unique_order_count" format={fmtCompact} sub="all time" />
                    <Stat q={activeArtists} label="Artists streamed" field="customers.unique_customer_count" format={fmtPlays} sub="with at least one play" />
                    <Stat q={royaltiesPaid} label="Royalties paid" field="total_order_amount" format={fmtMoney} sub="across all plays" />
                    <Stat q={royaltyPerPlay} label="Royalty per play" field="average_order_amount" format={fmtMoney2} sub="average" />
                </div>

                <div className="section-head">
                    <div>
                        <h2 className="section-title">Listening trends</h2>
                        <p className="section-sub">Every block below is one query or pipeline; open Lineage to see how each is built.</p>
                    </div>
                </div>

                <div className="grid">
                    <PlaysOverTime />
                    <TopArtists />
                    <PlaysByPlatform />
                </div>

                <div style={{ height: 16 }} />
                <BreakoutMonths />

                <div className="footer">
                    <span className="pill ghost">query-sdk</span>
                    <span>Orders are shown as plays and customers as artists for this demo.</span>
                </div>
            </div>
        </div>
    );
}
