# Table matrix through real Lightdash syncs. Guest, /tmp/gtf.  bash seq-matrix.sh <prefix> [case ...]
# Each case: sync 1 (n0 rows) -> user setup -> sync 2 (n1 rows, values shifted). run.js reads back ALL rows
# with values.get, which ignores filters, so hidden rows are checked too.
set -u
P="$1"; shift
ONLY="${*:-}"
cd /tmp/gtf
j() { node -e "console.log(require('/tmp/gtf/out/$1.json').$2)"; }
case_run() { # name n0 n1 shape setup...
  local name=$1 n0=$2 n1=$3 shape=$4; shift 4
  if [ -n "$ONLY" ] && ! echo " $ONLY " | grep -q " $name "; then return; fi
  echo "=== $name"
  node run.js "{\"label\":\"$P-$name-1\",\"shape\":\"$shape\",\"n\":$n0}"
  local S; S=$(j $P-$name-1 spreadsheetId)
  for step in "$@"; do eval "node tsetup.js $step"; done
  node tsetup.js state "$S" Sheet1 "$P-$name-before"
  node run.js "{\"label\":\"$P-$name-2\",\"shape\":\"$shape\",\"n\":$n1,\"offset\":3,\"sid\":\"$S\"}"
  node tsetup.js state "$S" Sheet1 "$P-$name-after"
}
case_run exact-nofilter      200 200 num3 "table \$S Sheet1 0 201 3"
case_run exact-nofilter-grow 200 333 num3 "table \$S Sheet1 0 201 3"
case_run exact-tf-same       200 200 num3 "table \$S Sheet1 0 201 3" "tablefilter \$S Sheet1"
case_run exact-tf-grow       200 333 num3 "table \$S Sheet1 0 201 3" "tablefilter \$S Sheet1"
case_run exact-tf-grow1500   200 1500 num3 "table \$S Sheet1 0 201 3" "tablefilter \$S Sheet1"
case_run exact-tf-shrink     333 70  num3 "table \$S Sheet1 0 334 3" "tablefilter \$S Sheet1"
case_run smaller-tf          200 200 num3 "table \$S Sheet1 0 51 3" "tablefilter \$S Sheet1"
case_run larger-tf           200 200 num3 "table \$S Sheet1 0 501 3" "tablefilter \$S Sheet1"
case_run rangefilter-grow    200 333 num3 "table \$S Sheet1 0 201 3" "rangefilter \$S Sheet1"
case_run filter-elsewhere    200 200 num3 "table \$S Sheet1 0 201 3" "filter-elsewhere \$S Sheet1"
case_run n9-tf-grow          70 229  n9   "table \$S Sheet1 0 71 9" "tablefilter \$S Sheet1"
case_run n9-nofilter-shrink  229 70  n9   "table \$S Sheet1 0 230 9"
case_run plainfilter-grow    200 1000 num3 "plainfilter \$S Sheet1 201 3"
echo "done $P"
