from pathlib import Path
import json,sys
root=Path(__file__).parent
source=json.loads((root/'source.json').read_text(encoding='utf-8'))
output=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
failures=[key for key in ('generation','amount') if output.get(key)!=source[key]]
print(json.dumps({'source':source,'output':output,'mismatches':failures}))
raise SystemExit(1 if failures else 0)
