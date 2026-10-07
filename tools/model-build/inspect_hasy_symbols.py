#!/usr/bin/env python3
import os
import csv

def main():
    base_dir = os.path.dirname(__file__)
    symbols_csv = os.path.join(base_dir, "hasy_data", "symbols.csv")

    symbols = []
    with open(symbols_csv, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            symbols.append(row)

    print("Checking all LaTeX symbols in HASYv2:")
    for s in symbols:
        latex = s.get('latex', '').strip()
        sid = s.get('symbol_id', '').strip()
        samples = s.get('training_samples', '')
        if latex in ['+', '-', '=', '\\times', '\\div', '.', '\\cdot', '\\dots', '=']:
            print(f"MATCH: ID {sid:>4s} | LaTeX: '{latex}' | Samples: {samples}")
        elif latex == '=' or latex.startswith('='):
            print(f"EQUAL MATCH: ID {sid:>4s} | LaTeX: '{latex}' | Samples: {samples}")

if __name__ == '__main__':
    main()
