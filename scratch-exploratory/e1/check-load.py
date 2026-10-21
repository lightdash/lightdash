import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'examples/multi-repo-dbt-sim'))
from tooling import check_load
check_load()
