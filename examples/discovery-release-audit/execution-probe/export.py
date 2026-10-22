"""Export exact SKU aggregates and preserve original order data in a notes CSV."""
import argparse
import csv
import json
from collections import defaultdict
from decimal import Decimal, Inexact, localcontext
from pathlib import Path


def export(source, summary, notes):
    if len({path.resolve() for path in (source, summary, notes)}) != 3:
        raise ValueError("Input and both outputs must be distinct files")
    with source.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fields = reader.fieldnames
        rows = list(reader)
    if fields is None or not {"sku", "quantity", "unit_price", "note"}.issubset(fields):
        raise ValueError("Missing required input columns")
    totals = defaultdict(Decimal)
    with localcontext() as context:
        # Reject rather than silently round an amount requiring a missing policy.
        context.traps[Inexact] = True
        for row in rows:
            totals[row["sku"]] += Decimal(row["quantity"]) * Decimal(row["unit_price"])
        summary_rows = [(sku, format(totals[sku].quantize(Decimal("0.01")), ".2f")) for sku in sorted(totals)]
    with summary.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["sku", "total"])
        writer.writerows(summary_rows)
    with notes.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    return {"orders": len(rows), "skus": len(totals)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("summary", type=Path)
    parser.add_argument("notes", type=Path)
    args = parser.parse_args()
    print(json.dumps(export(args.source, args.summary, args.notes)))
