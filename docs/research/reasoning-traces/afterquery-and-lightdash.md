# AfterQuery, and what Lightdash could do better

Research note, 2026-09-03. Companion to `findings-2026-09-03.md`. Sources at the end.

## The short version

AfterQuery sells frontier labs the thing the labs cannot scrape: how experts
think while they work. They pay practitioners to author tasks, write rubrics,
demonstrate solutions and grade model attempts, then package that as SFT
traces, RL environments with verifiers, preference pairs and benchmarks. It is
staged work, produced to order, verified by design, and it earns them a claimed
$100M run rate fourteen months in.

Lightdash sits on the unstaged version of the same thing for one profession:
people answering real questions against real data, step by step, with a
semantic layer underneath that makes each step typed and checkable, and an
agent whose every prompt, tool call, correction and thumbs-down is already in
the database. The spike showed that half of real exploration reads as a
question with no new capture at all.

The "better" is not "more experts than AfterQuery". It is: naturally occurring
instead of staged, verifiable by construction instead of by rubric, continuous
instead of batch, and paired (human path next to agent path on the same
question) instead of single-sided. The cost is consent, anonymisation, and
building the environment. All three are tractable.

## 1. What AfterQuery is

| | |
|---|---|
| Founded | January 2025, Y Combinator W25, San Francisco, ~30 people |
| Founders | Spencer Mateega (CEO; Morgan Stanley, Silver Lake, Meta, Google), Carlos Georgescu (CTO; Citadel, Meta, Google), Danny Tang |
| Funding | $500K pre-seed; $30M Series A at $300M post, April 2026, led by Altos Ventures with The Raine Group, YC, Latitude, BoxGroup and angels from DeepMind, OpenAI, Anthropic, Meta Superintelligence Labs, Microsoft AI |
| Claimed traction | $100M+ revenue run rate; "every US-based frontier AI lab is a customer"; NVIDIA named as the only data vendor in the Nemotron 3 Ultra report |
| Positioning | "An applied research lab curating data solutions for frontier foundation model development." "Models trained on outputs plateau. Models trained on reasoning improve." |
| Expert network | Quoted between "nearly 100,000" and "300,000+" verified practitioners; contractors paid roughly $25–60/h general, $120–200/h for physicians, doing prompt writing, reasoning write-ups, grading, rubric authoring and demonstrations |
| Pricing | Project-based, tied to capability targets, priced on domain difficulty, expert mix, environment complexity and volume; no seats |
| Compliance | ISO 27001, SOC 2 Type II |

### Product lines

1. **SFT data.** Prompt–response pairs and chain-of-thought reasoning traces,
   written or demonstrated by experts.
2. **RL with rubrics and verifiers.** Expert-written prompts plus grading
   frameworks that score intermediate steps, and automated verifiers where the
   domain allows (tests, cell-level checks).
3. **Agent and tool-calling environments.** Sandboxes on real APIs, MCP
   servers and developer tools, with automated evaluation. They co-maintain
   Harbor, the Terminal-Bench evaluation framework, and published MCP-Atlas
   style tool-use tasks.
4. **Computer-use and browser trajectories.** Screen-recorded expert
   demonstrations.
5. **RLHF comparison pairs, custom evals, deep research, loss analyses,
   off-the-shelf packs, post-training as a service, and forward-deployed
   engineering** (the Raine Group engagement: three days embedded, a firm
   taxonomy, a semantic index over deal precedents).

### How they make a dataset

The process is consistent across their write-ups:

1. **Failure-mode research first.** Publish a benchmark where models fail on
   professional work (FinanceQA: 60% failure on hand-spread analyst tasks;
   SpreadsheetBench 2: frontier models fix ~40–50% of cells; IDE-Bench,
   UI-Bench, App-Bench, Market-Bench, Legora BAR). The benchmark is the sales
   pitch.
2. **Experts author tasks with verification built in.** Tasks are "file-grounded
   inputs, multi-step analysis, and rubrics" (GDPval style), or environments
   with test suites (Terminal-Bench), or cell-level gold files (spreadsheets).
3. **Trajectories come from experts or from strong-model rollouts filtered by
   experts.** For NVIDIA: "for each AQ task, we used a strong model to generate
   multiple full trajectory rollouts", then light SFT and pivot-based RL
   distillation. For Terminal-Bench: SFT on expert-labelled successful
   trajectories ("explore → plan → edit → test → debug → pass"), then GRPO with
   per-test partial reward and an efficiency bonus.
4. **Verify.** Test suites, cell diffs, rubric-guided LLM judges, human expert
   graders (GDPval's own automated grader only agrees with humans 66% of the
   time, which is why rubrics matter to them).
5. **Prove it on the benchmark.** gpt-oss-20b from 3.1% to 17.0% on
   Terminal-Bench 2.0; Llama-3.1-8B up to 4.3× on τ²-bench from 1,057 rollouts;
   Nemotron 3 Ultra from 35.3 to 46.7 on GDPval; +21% net win-loss on GDPval
   from on-policy distillation. Their stated lesson: "the largest gain comes
   from the SFT stage, which is entirely a function of data quality", and the
   visible change is workflow ("explore the environment before acting"), not
   raw ability.

### What this data is, structurally

Every AfterQuery artefact is **staged**: a task someone was paid to invent,
solved once, in a sandbox, with no stake in the answer. The rubric is written
after the fact by another expert. The trajectory is either a demonstration or a
filtered model rollout. It is expensive (hundreds of dollars per task at their
rates), it is a one-shot snapshot, and it captures what an expert *would* do,
not what people *did*.

That is fine for terminals and spreadsheets, where the sandbox is the real
thing. For analytics it misses the part that matters: the question arrived
because a number looked wrong on a dashboard, the person did not know which
explore held the answer, they tried three filters, opened the rows, asked the
agent, and saved a chart with a title that was the question all along.

## 2. What Lightdash already holds

Verified against the schema in `packages/backend/src/ee/database/entities`
and the extraction in this directory.

### The human path (application database)

- `query_history`: one row per executed query with the full `metric_query`
  (explore, dimensions, metrics, filters with operators and values, sorts,
  table calculations, custom dimensions and metrics), the `compiled_sql`, the
  `context` (explore, dashboard tile, underlying data, SQL runner, agent, MCP),
  row count, timing, error, cache key. This is the reasoning trace at the
  resolution of "what they asked the warehouse".
- `saved_queries_versions` and `saved_queries_version_fields`: every chart save
  with its fields and filters, and a title that is usually the question.
- `dashboard_versions`, `analytics_chart_views`, `analytics_dashboard_views`.
- `content_verification`: a human marking a chart or dashboard as verified.
  That is a gold label nobody paid for.

### The agent path (same database, EE tables)

- `ai_prompt`: prompt, response, `metric_query`, `viz_config_output`,
  `filters_output`, `saved_query_uuid`, `human_score`, `human_feedback`,
  `token_usage`, `model_config`, `title`.
- `ai_agent_tool_call` and `ai_agent_tool_result`: the agent's trajectory
  (`tool_name`, `tool_args`, `parent_tool_call_id`, `result`, `summary`).
- `ai_agent_reasoning`: the agent's stored reasoning per turn.
- `ai_prompt_steer` and `ai_prompt_interrupt`: a human redirecting or stopping
  the agent mid-run. This is on-policy correction data, the exact shape
  "pivot" distillation wants.
- `ai_agent_review_*`: turn signals, review runs, items, remediations.
- `ai_agent_memory`, `ai_thread_distill`, `ai_thread_compaction`: what the
  agent learned from an organisation's threads.
- `ai_eval`, `ai_eval_prompt`, `ai_eval_run`, `ai_eval_run_result` (+
  assessments with `expected_response`, `llm_judge_model`, human
  `assessed_by_user_uuid`): an eval harness already exists per agent.
- `ai_deep_research_runs` and events: multi-step research with reports.
- `ai_writeback_*` with `pr_url`, `branch_name`: the agent proposing dbt
  changes as pull requests. Merged or not is a verifiable outcome.
- `ai_sql_approval`: a human approving generated SQL.
- `ai_artifacts` and versions: agent-produced charts and dashboards.

### The verifier (the semantic layer)

Every metric query resolves through dbt models and Lightdash YAML: metric
definitions, dimension types, joins, descriptions, `ai_hints`, required
filters, parameters. Two queries can be compared for equivalence at the level
of explore, metric set, dimension set, filter set and grain without running
them, and by result hash if you do. That is what AfterQuery has to hand-write
as a rubric ("is 2025 net income calculated correctly, is 2024 shareholders'
equity correctly identified"). Here the rubric is the YAML someone already
wrote to make the number right for their own company.

### What the spike measured

30 days, one organisation, 37 users: 1,708 episodes, 970 with three or more
steps. Read through the application database, 25 of 50 sampled exploration
episodes were legible as a question (18 on real data); 13 of those needed no
prompt, the field names and chart title were enough. 30% of multi-step
Analytics episodes contain a prompt; 10 contain an agent-to-explorer hand-off
where the person continued the agent's query by hand. Through telemetry the
same sample gave 2 of 50.

## 3. Where Lightdash can be better, and where it cannot

| Dimension | AfterQuery | Lightdash | Verdict |
|---|---|---|---|
| Provenance | Staged tasks authored by paid experts | Real questions, real stakes, in situ | Lightdash. This is the thing labs say they cannot get |
| Verification | Rubrics and verifiers written per task; LLM judges where no verifier exists | Semantic-layer equality and result hashes, by construction; human "verified" marks; merged PRs; thumbs | Lightdash, for the analytics domain only |
| Pairing | One trajectory per task | Agent turn and human continuation on the same question; steers and interrupts | Lightdash. Contrastive pairs come free |
| Continuity | Batch deliveries | Continuous stream, versioned against schema drift | Lightdash |
| Cost per trace | Expert hours | Marginal | Lightdash, but consent and anonymisation are not free |
| Environment | Docker sandboxes on real tools (Harbor) | Lightdash itself: dbt project + warehouse + semantic layer + MCP tools; demo projects already exist; docker-dev runs it | Parity is reachable; Lightdash's is a real product surface |
| Breadth | Medicine, law, finance, engineering, gaming | One profession: data analysis, across every industry Lightdash serves | AfterQuery. Lightdash should own depth |
| Task authoring | Experts invent tasks | Tasks fall out of usage; no one invents them | Lightdash, with the caveat that usage is biased to what the product makes easy |
| Grading humans | 100k+ vetted graders | Customers' analysts, unpaid, only via product signals | AfterQuery for explicit grading; Lightdash for implicit |
| Buyer relationships, packaging, research brand, SOC 2 for lab procurement | Established | None for this purpose | AfterQuery |
| Consent and IP | Contractors assign rights | Customer data under customer contracts, some with explicit no-AI-training clauses | AfterQuery. This is Lightdash's hardest constraint |

The honest summary: for the analytics profession Lightdash can produce a
better dataset than any vendor can commission, but it cannot sell it to a lab
tomorrow. The route runs through Lightdash's own agent first.

## 4. The design

### 4.1 The unit: an Episode

One person, one project, one question, from the first query to the last
outcome, with both the human path and any agent turns inside it.

```
Episode
  question         inferred (from fields, titles, prompts) or captured
  context          explore descriptions and metric definitions used (the "rubric")
  steps[]          {ts, actor: human|agent, kind, metric_query|prompt|tool_call, result_ref, error}
  corrections[]    steers, interrupts, thumbs-down followed by retry, agent query re-run by hand
  outcome          saved chart | verified chart | dashboard add | agent answer accepted | abandoned
  verifier         canonical metric query of the outcome + result hash, or none
  provenance       org (hashed), project category, schema version, consent tier
```

The spike's `sessionise.py` already produces most of this from
`query_history`, `ai_prompt` and the save tables. Missing today: filter values
(deliberately dropped), `ai_prompt.response`, tool calls, reasoning, steers,
`human_score`, `content_verification`.

### 4.2 Four data products, grounded

1. **Traces for SFT.** Episodes whose outcome is a saved chart, a verified
   chart or an accepted agent answer. Rendered as prompt → tool calls →
   metric query → chart, with the human's inferred question as the prompt when
   no prompt exists. The 13-of-18 result says a large share of these need no
   text at all.
2. **Preference and correction pairs.** Agent response versus the human's next
   query on the same explore within two minutes; steered versus unsteered
   runs; thumbs-down turn versus the turn that was finally accepted; review
   remediations. AfterQuery pays experts to write "comparison pairs";
   Lightdash records them as they happen.
3. **Environments with verifiers.** A Lightdash instance in Docker (docker-dev
   already does this) with a dbt project and a DuckDB or Postgres warehouse,
   exposing the MCP tools the agent uses in production. Tasks are anonymised
   episodes: the question plus the schema state, with the gold metric query
   and result hash as verifier. Reward is per-component like AfterQuery's
   per-test reward: right explore, right metrics, right grain, right filters,
   right result, plus an efficiency term. Demo projects (SaaS, retail, FP&A,
   healthcare, GitHub) are ready-made sandboxes; customer projects become
   sandboxes only under consent and with values synthesised.
4. **A public benchmark.** "AnalystBench" or similar: real questions from
   Lightdash usage across industries, graded by the semantic layer, so grading
   is deterministic where GDPval's automated grader reaches 66% agreement.
   This is the AfterQuery demand engine, pointed at the one domain where
   Lightdash has the ground truth. It is also the first thing a lab would ask
   for before buying data.

### 4.3 Where the traces are captured, in product

- **Nothing new for most of it.** The database already has it. Productise the
  read-replica extraction, not a new event stream.
- **Ask at two moments only.** At save (a one-line "what question does this
  answer?" prefilled from the inferred question) and at the end of a
  narrowing run (detectable from the path). Never on dashboard reloads.
- **Prompts are already intent.** Store the response and tool calls next to
  the resulting query, which the schema does; add the saved-chart link when
  the person saves from an agent answer (`ai_prompt.saved_query_uuid` exists).
- **Verification is a label.** Treat `content_verification`, dashboard
  promotion, and PR merges of writebacks as gold outcomes, and surface them in
  the extraction.

### 4.4 Consent, anonymisation, contracts

This is the part AfterQuery does not have to solve and Lightdash must.

- **What the contracts say today.** The standard Cloud Service Agreement
  (usage-data clause, §9.7 in the current version, §8.7 in the public 2023
  terms) lets Lightdash use data relating to Customer Data to "improve and
  enhance the Services" and for "development, diagnostic and corrective
  purposes", and to disclose it only in aggregated or de-identified form. It
  does not mention AI or ML. So training Lightdash's own agent on de-identified
  usage is arguably inside the standard terms; licensing traces to a third
  party is not. Two negotiated precedents already exist: a DPA addendum that
  commits LLM sub-processors to zero retention and zero training, and a §9.7
  redline that limits Lightdash's own rights to aggregated and anonymised data
  only. At least one enterprise agreement forbids using customer data to
  create or improve software or ML models outright.
- **Opt-in per organisation**, off by default, as a data-sharing tier with a
  DPA addendum. Organisations on a restrictive redline or a no-training clause
  are excluded at the query level, not the policy level. Add an explicit
  AI-training clause to the online terms before anything leaves the internal
  organisation; the standard wording predates the agent.
- **Two tiers.** Tier 1: internal use only, to improve the organisation's own
  agent (memory, evals, self-improvement already exist as features). Tier 2:
  contribution to a pooled, anonymised corpus.
- **What leaves the tenant.** Field names and explore names are customer IP
  in some cases. Options: keep them for tier 1; for tier 2 map to the field
  descriptions or to a canonical vocabulary from the verticals work, and
  synthesise values. Prompts must be redacted, not just titles: the spike
  found prospect names in prompts.
- **Demo and test projects stay out** of any real-data corpus and in the
  environment corpus. The spike found they produce most saves.

### 4.5 Sequence

1. **Weeks 1–4: finish the extraction.** Add filter values (hashed), agent
   response, tool calls, reasoning, steers, scores, verification labels.
   Define the Episode schema and emit JSONL. Re-run the 50-episode read with
   the outcome labels present.
2. **Weeks 4–8: the verifier and the environment.** Canonical metric-query
   equality, result hashing, per-component reward. Stand up the Docker
   environment from docker-dev with the SaaS and retail demo projects, load
   200 anonymised internal episodes as tasks, and run a baseline with an open
   model the way AfterQuery did (gpt-oss-20b through Tinker, or the in-house
   agent with a small model). Publish the number.
3. **Weeks 8–12: use it on our own agent.** SFT and on-policy distillation of
   a small model for the Lightdash agent from internal episodes and
   correction pairs; measure on the environment and on the existing `ai_eval`
   harness. This proves the data before anyone is asked to license it.
4. **Then: consent tier, benchmark paper, and the lab conversation.** With a
   result in hand, the pitch to a lab or to a vendor like AfterQuery is
   "environment plus continuous real traces for the analytics profession,
   verifiable by the semantic layer", which is a category they do not have.

## 5. Risks that would sink it

- **Consent and contracts.** Non-negotiable; the spike already leaked prospect
  names into prompts.
- **Selection bias.** Lightdash users are dbt-literate; the corpus will
  over-represent modelled data and under-represent messy analysis.
- **Reward hacking on semantic equality.** Equal metric queries can still be
  the wrong answer if the model is wrong; pair with result hashes and human
  verification marks.
- **Noise.** Metrics-catalog previews, dashboard tile loads and auto-refresh
  loops dominate raw volume and look like exploration until collapsed.
- **Retention.** `query_history` is on a rolling window; the corpus must be
  extracted continuously or the traces are gone.
- **Volume claims.** One organisation gave 1,708 episodes a month. Fleet-wide
  numbers need measuring before they go in a deck.

## Sources

- afterquery.com: home, products, solutions, research, careers
- "The AfterQuery Thesis" (Oct 2025); "Human expertise, reimagined" (Apr 2026)
- "How We Improved Terminal-Bench 2.0 Scores by Over 5x Using Tinker and Harbor" (Mar 2026)
- "How AfterQuery Helped NVIDIA Hill-Climb GDPval" (Jul 2026); "net win-loss margin of +21.4% on GDPval with on-policy distillation" (Jun 2026)
- "How AfterQuery Expert Data Drives Model Performance on τ²-bench" (Apr 2026)
- "Solving the Last Mile Problem in Partnership with The Raine Group" (Apr 2026)
- Business Wire, Series A announcement (Apr 9 2026); Sacra profile; Y Combinator profile; contractor review sites (third-party, unaudited)
- FinanceQA (arXiv 2501.18062); SpreadsheetBench 2 (spreadsheetbench.github.io); IDE-Bench (2601.20886); UI-Bench (2508.20410); Market-Bench (2512.12264); MCP-Atlas (github.com/AfterQuery/mcp-atlas)
- GDPval (OpenAI, arXiv 2510.04374); "Arming Data Agents with Tribal Knowledge" (2602.13521); CORGI business text-to-SQL (2510.07309); dbt "Semantic Layer vs Text-to-SQL 2026"
- Troveo, AI data licensing 2026; Markov (markovstudios.com) for real-workflow computer-use data
- Lightdash: `packages/backend/src/ee/database/entities/ai.ts`, `aiEvals.ts`; `docs/research/reasoning-traces/findings-2026-09-03.md`
