"""Verify saved CSV semantics independently of exporter implementation.

Catches lost duplicate contributions, numeric SKU conversion, unsorted summary,
binary-float/format defects, and changed/dropped/reordered source notes.
"""
import csv
import json
import re
import sys
from collections import defaultdict
from fractions import Fraction
from pathlib import Path

source, summary_path, notes_path = map(Path, sys.argv[1:4])
with source.open(encoding="utf-8-sig", newline="") as handle:
    reader = csv.DictReader(handle)
    fields = reader.fieldnames
    orders = list(reader)

contributions = []
totals = defaultdict(Fraction)
for index, row in enumerate(orders, 1):
    amount = Fraction(row["quantity"]) * Fraction(row["unit_price"])
    totals[row["sku"]] += amount
    contributions.append({"source_record": index, "sku": row["sku"],
                          "amount_fraction": str(amount)})
expected = []
for sku in sorted(totals):
    cents = totals[sku] * 100
    assert cents.denominator == 1, "Fixture total requires an unspecified rounding policy"
    expected.append({"sku": sku, "total": f"{cents.numerator // 100}.{cents.numerator % 100:02d}"})

checks = []
def check(name, condition, actual=None):
    checks.append({"name": name, "pass": bool(condition), "actual": actual})

check("four source order records", len(orders) == 4, len(orders))
check("source fixture oracle", expected == [
    {"sku": "0012", "total": "0.70"},
    {"sku": "0040", "total": "2.50"},
    {"sku": "0100", "total": "0.01"},
], expected)
if summary_path.exists():
    with summary_path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        summary_fields = reader.fieldnames
        summary = list(reader)
    check("summary headers", summary_fields == ["sku", "total"], summary_fields)
    check("one row per exact identifier", len(summary) == len(totals) and
          sorted(row["sku"] for row in summary) == sorted(totals), summary)
    check("lexicographic string order", [r["sku"] for r in summary] == sorted(totals))
    check("exact per-SKU totals retain every contribution", summary == expected, summary)
    check("money has exactly two decimal places", all(
        re.fullmatch(r"-?\d+\.\d{2}", r["total"]) for r in summary))
    check("grand total reconciles", sum((Fraction(r["total"]) for r in summary), Fraction())
          == sum(totals.values(), Fraction()))
else:
    check("summary exists", False)

if notes_path.exists():
    with notes_path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        note_fields = reader.fieldnames
        notes = list(reader)
    check("notes original columns", note_fields == fields, note_fields)
    check("notes preserve original four rows and all string values", notes == orders, notes)
    check("quoted comma and embedded newline preserved", notes[0]["note"] == "包装,保留"
          and notes[1]["note"] == "line one\nline two")
else:
    check("notes exists", False)

result = {"status": "pass" if all(c["pass"] for c in checks) else "fail",
          "source_records": len(orders), "source_contributions": contributions,
          "expected_summary": expected, "checks": checks}
print(json.dumps(result, ensure_ascii=True, indent=2))
raise SystemExit(0 if result["status"] == "pass" else 1)
