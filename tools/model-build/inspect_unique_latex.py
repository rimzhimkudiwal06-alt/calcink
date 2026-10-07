#!/usr/bin/env python3
import os
import csv

def main():
    base_dir = os.path.dirname(__file__)
    labels_csv = os.path.join(base_dir, "hasy_data", "hasy-data-labels.csv")

    unique_symbols = {}
    with open(labels_csv, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            sid = row['symbol_id']
            latex = row['latex']
            unique_symbols[sid] = latex

    print(f"Total unique symbol_ids in hasy-data-labels.csv: {len(unique_symbols)}")
    print("\nNon-backslash symbol classes:")
    for sid, latex in sorted(unique_symbols.items(), key=lambda x: int(x[0])):
        if not latex.startswith('\\'):
            print(f"ID {sid:>4s}: {repr(latex)}")

if __name__ == '__main__':
    main()
