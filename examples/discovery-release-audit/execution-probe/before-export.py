import csv,sys
from pathlib import Path
rows=list(csv.DictReader(Path(sys.argv[1]).read_text(encoding='utf-8-sig').splitlines()))
with Path(sys.argv[2]).open('w',encoding='utf-8',newline='') as f:
 w=csv.writer(f);w.writerow(['sku','total']);w.writerows((int(r['sku']),float(r['quantity'])*float(r['unit_price'])) for r in rows)
