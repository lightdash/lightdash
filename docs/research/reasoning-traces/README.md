# Reasoning-trace spike

Can the fragments Lightdash already stores be stitched into readable "analysis
episodes": one person's path from a question, through explore runs and agent
prompts, to a saved chart or a dead end? This spike answers that with data
before any schema work is proposed.

It reads only existing tables and writes nothing to the database.

## What it does

1. `extract_events.sql` pulls every human-attributable step for one organisation
   over the last N days into one typed event stream: query history rows (with
   the semantic shape of each query), chart and dashboard saves, chart and
   dashboard views, and AI agent prompts. Scheduled deliveries, filter
   autocomplete, service accounts and hidden agent turns are excluded.
2. `sessionise.py` stitches the stream into episodes (same user, same project,
   consecutive events under a gap), diffs each query against the previous one
   in the episode so a step reads as "+dimension payments_payment_method,
   +filter orders_status equals", classifies each episode, and renders a sample
   as Markdown to read by hand.

## Running it against a real database

```bash
psql "$DATABASE_URL" -v org_uuid="'<organization_uuid>'" -v days=30 \
     -At -F $'\t' -f extract_events.sql > events.tsv
python3 sessionise.py events.tsv --gap-minutes 20 --sample 50 --out-dir out
```

`out/episodes.md` is the artefact to read. `out/episodes.jsonl` holds every
episode for further analysis. The summary printed to stdout gives the episode
class mix, which is the first thing to look at: if almost everything is
`consumption`, sampling is the problem to solve before intent capture.

Read the fifty and score each one on a single question: could a colleague who
was not there tell what this person was trying to find out? Count the yeses.

## Proving the pipeline without a database

`fixture.sql` declares only the columns the extraction touches and inserts a
small synthetic history: one real exploration, one pure dashboard view, one
dead end, and two rows that must be filtered out. Against a scratch Postgres:

```bash
createdb spike && psql spike -f fixture.sql
psql spike -v org_uuid="'11111111-1111-1111-1111-111111111111'" -v days=30 \
     -At -F $'\t' -f extract_events.sql > events.tsv
python3 sessionise.py events.tsv --out-dir out
```

The fixture proves the SQL and the sessioniser run end to end. It says nothing
about whether real episodes read as reasoning; only real data answers that.

## Known limits

- `query_history` is deleted on a rolling retention window, so the look-back is
  bounded by that setting, not by the `days` parameter.
- Query ordering relies on timestamps. Two explorer tabs open at once interleave.
- The SQL runner leaves only compiled SQL behind, so those steps show as
  "runs SQL" without a shape diff.
- Episode boundaries are a heuristic. A 20 minute gap splits a long lunch into
  two episodes and merges two quick unrelated questions into one.
