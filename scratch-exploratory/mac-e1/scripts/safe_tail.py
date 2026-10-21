import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
text = '\n'.join(Path(sys.argv[1]).read_text(errors='replace').splitlines()[-int(sys.argv[2] if len(sys.argv) > 2 else 20):])
for line in (root / 'scratch-exploratory/e1/.env').read_text().splitlines():
    key, value = line.split('=', 1)
    if value and re.search('PASSWORD|SECRET|TOKEN|API_KEY', key):
        text = text.replace(value, '<local-secret>')
text = text.replace(str(root), '$WORKTREE')
print(re.sub(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', '<local-id>', text, flags=re.I))
