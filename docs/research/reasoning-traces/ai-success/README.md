# AI-success spike scripts

Builds a prompt-level table from the analytics warehouse and produces the
tables in `../findings-ai-success-2026-09-03.md`.

```bash
export AI_SPIKE_DIR=/tmp/ai-spike && mkdir -p $AI_SPIKE_DIR
# 1. Pull prompts.csv, projects.csv, agents.csv, orgs.csv with bq (queries in queries.sql)
# 2. python3 -m venv venv && venv/bin/pip install pandas numpy statsmodels
python3 prep.py && python3 analyse.py && python3 analyse2.py
```

Internal organisations are excluded in `analyse2.py`; all output is aggregate.
