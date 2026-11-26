# Table matrix through real Lightdash syncs. Guest, /tmp/gtf.  bash seq-matrix.sh <prefix>
# Each case: sync 1 (n0 rows) -> user setup -> sync 2 (n1 rows). run.js reads back ALL rows (values.get ignores filters).
# Run once on the old code, once on main (expect failures) and once on the branch. Needs a Google refresh token in the env.
set -u
P="$1"
cd /tmp/gtf
j() { node -e "console.log(require('/tmp/gtf/out/$1.json').$2)"; }
case_run() { # name n0 n1 shape cols setup...
  local name=$1 n0=$2 n1=$3 shape=$4 cols=$5; shift 5
  node run.js "{\"label\":\"$P-$name-1\",\"shape\":\"$shape\",\"n\":$n0}"
  local S; S=$(j $P-$name-1 spreadsheetId); local SQL; SQL=$(j $P-$name-1 savedSqlUuid)
  for step in "$@"; do eval "node tsetup.js $step"; done
  node tsetup.js state "$S" Sheet1 "$P-$name-before"
  node run.js "{\"label\":\"$P-$name-2\",\"shape\":\"$shape\",\"n\":$n1,\"offset\":3,\"sid\":\"$S\"}"
  node tsetup.js state "$S" Sheet1 "$P-$name-after"
}
# table exactly over the data, no filter / with a table filter; same, grow, shrink
case_run exact-nofilter        200 200 num3 3 "table \$S Sheet1 0 201 3"
case_run exact-filter-same     200 200 num3 3 "table \$S Sheet1 0 201 3" "tablefilter \$S Sheet1"
case_run exact-filter-grow     200 333 num3 3 "table \$S Sheet1 0 201 3" "tablefilter \$S Sheet1"
case_run exact-filter-shrink   333 70  num3 3 "table \$S Sheet1 0 334 3" "tablefilter \$S Sheet1"
# smaller and larger tables, with a filter
case_run smaller-filter        200 200 num3 3 "table \$S Sheet1 0 51 3" "tablefilter \$S Sheet1"
case_run larger-filter         200 200 num3 3 "table \$S Sheet1 0 501 3" "tablefilter \$S Sheet1"
# table plus a basic filter elsewhere (if Google allows it)
case_run table-filter-elsewhere 200 200 num3 3 "table \$S Sheet1 0 201 3" "filter-elsewhere \$S Sheet1"
# the small daily shape: 9 columns, 70-229 rows
case_run n9-filter-grow        70 229 n9 9 "table \$S Sheet1 0 71 9" "tablefilter \$S Sheet1"
case_run n9-nofilter-shrink    229 70 n9 9 "table \$S Sheet1 0 230 9"
echo "done $P"
