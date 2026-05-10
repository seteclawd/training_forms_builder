#!/usr/bin/env python3
"""
PDF Table Extractor — Extract tables from PDF with styles using pdfplumber.
Outputs JSON with structure + cell styles for Form Builder consumption.

Usage:
  python3 pdf-table-extractor.py <input.pdf> [--output <output.json>] [--html]
  
  --output, -o <file>  Save JSON to file (default: stdout)
  --html               Also output HTML with inline styles
  --table <index>      Extract only table at index (default: all tables)
  --page <number>      Extract only from page number (default: all pages)
  --form-builder       Output Form Builder table config
"""

import sys
import json
import re
import argparse
import os
import time

try:
    import pdfplumber
except ImportError:
    print("Error: pdfplumber not installed. Run: pip3 install pdfplumber", file=sys.stderr)
    sys.exit(1)


def rgb_to_hex(color):
    """Convert pdfplumber color to hex."""
    if color is None:
        return None
    if isinstance(color, str):
        if color.startswith('#'):
            return color
        if color in ('transparent', ''):
            return None
        return color
    if isinstance(color, tuple):
        r, g, b = [int(c * 255) for c in color[:3]]
        return f'#{r:02x}{g:02x}{b:02x}'
    return None


def get_cell_text(page, cell_bbox):
    """Extract text within a cell bbox using page.crop()."""
    if not cell_bbox:
        return ""
    try:
        x0, top, x1, bottom = cell_bbox
        cropped = page.crop((x0, top, x1, bottom))
        text = cropped.extract_text(x_tolerance=2, y_tolerance=2) or ""
        return text.strip()
    except Exception:
        return ""


def detect_cell_style(page, cell_bbox):
    """Try to detect cell background color from the PDF."""
    style = {}
    if not cell_bbox:
        return style
    
    try:
        x0, top, x1, bottom = cell_bbox
        width = x1 - x0
        height = bottom - top
        
        # Check for filled rectangles in the cell area
        if hasattr(page, 'rects'):
            for rect in page.rects:
                rx0, ry0, rx1, ry1 = rect['x0'], rect['top'], rect['x1'], rect['bottom']
                # Check if rect overlaps with cell
                if (rx0 <= x1 and rx1 >= x0 and ry0 <= bottom and ry1 >= top):
                    # Check overlap ratio
                    overlap_w = min(rx1, x1) - max(rx0, x0)
                    overlap_h = min(ry1, bottom) - max(ry0, top)
                    if overlap_w > 0 and overlap_h > 0:
                        overlap_ratio = (overlap_w * overlap_h) / (width * height) if width * height > 0 else 0
                        if overlap_ratio > 0.5:  # More than 50% coverage
                            fill = rect.get('fill')
                            if fill:
                                style['backgroundColor'] = rgb_to_hex(fill)
                                break
    except Exception:
        pass
    
    return style


def extract_tables_from_pdf(pdf_path, page_num=None, table_index=None):
    """Extract tables from PDF with cell-level styles."""
    results = []
    
    with pdfplumber.open(pdf_path) as pdf:
        pages = [pdf.pages[page_num - 1]] if page_num else pdf.pages
        
        for page_idx, page in enumerate(pages):
            actual_page = page_idx if not page_num else page_num - 1
            
            # Load page objects for style detection
            try:
                page_objects = page.chars  # For text detection
            except Exception:
                pass
            
            # Try find_tables with different strategies
            strategies = [
                {"vertical_strategy": "lines", "horizontal_strategy": "lines"},
                {"vertical_strategy": "lines_strict", "horizontal_strategy": "lines_strict"},
                {"vertical_strategy": "text", "horizontal_strategy": "text", "snap_tolerance": 3},
            ]
            
            best_table = None
            best_cell_count = 0
            
            for strategy in strategies:
                try:
                    found_tables = page.find_tables([strategy]) if hasattr(page, 'find_tables') else []
                    # find_tables with a list of strategies in newer pdfplumber
                    if not found_tables:
                        found_tables = page.find_tables(strategy)
                except Exception:
                    try:
                        found_tables = page.find_tables()
                    except Exception:
                        continue
                
                if not found_tables:
                    continue
                
                # Pick the table with most cells
                for t in found_tables:
                    data = t.extract()
                    cell_count = sum(1 for row in data for cell in row if cell is not None and cell != '')
                    if cell_count > best_cell_count:
                        best_cell_count = cell_count
                        best_table = t
            
            if not best_table or best_cell_count == 0:
                continue
            
            if table_index is not None and len(results) != table_index:
                # Skip if not the requested table index
                results.append(None)  # placeholder
                continue
            
            data = best_table.extract()
            table_data = {
                "page": actual_page + 1,
                "tableIndex": len(results),
                "rows": [],
                "cells": {},
                "columns": [],
                "rowCount": len(data),
                "colCount": max((len(row) for row in data), default=0)
            }
            
            max_cols = table_data["colCount"]
            
            for row_idx, row in enumerate(data):
                row_data = []
                
                for col_idx in range(max_cols):
                    text = ""
                    if col_idx < len(row):
                        text = (row[col_idx] or "").strip()
                    
                    cell_key = f"cell_{row_idx}_{col_idx}"
                    is_header = row_idx == 0
                    
                    # Get cell bbox for style detection
                    cell_bbox = None
                    try:
                        if hasattr(best_table, 'rows') and row_idx < len(best_table.rows):
                            cells_in_row = best_table.rows[row_idx].cells
                            if col_idx < len(cells_in_row):
                                cell_bbox = cells_in_row[col_idx]
                    except Exception:
                        pass
                    
                    # Detect style from PDF
                    style = detect_cell_style(page, cell_bbox)
                    
                    cell_data = {
                        "text": text,
                        "row": row_idx,
                        "col": col_idx,
                        "isHeader": is_header,
                        "style": style,
                    }
                    
                    # Width/height from bbox
                    if cell_bbox:
                        cell_data["bbox"] = [round(c, 2) for c in cell_bbox]
                        cell_data["width"] = round(cell_bbox[2] - cell_bbox[0], 2)
                        cell_data["height"] = round(cell_bbox[3] - cell_bbox[1], 2)
                    
                    table_data["cells"][cell_key] = cell_data
                    row_data.append(text)
                
                table_data["rows"].append(row_data)
            
            # Build columns from header
            if table_data["rows"]:
                header = table_data["rows"][0]
                table_data["columns"] = [{"index": i, "name": col or f"Col {i+1}"} for i, col in enumerate(header)]
            
            results.append(table_data)
    
    return [r for r in results if r is not None]


def generate_html(tables):
    """Generate HTML from extracted table data with CSS styles."""
    html_parts = []
    
    for t_idx, table in enumerate(tables):
        html = '<table style="border-collapse:collapse;width:100%;">\n'
        rendered = set()
        
        for row_idx, row in enumerate(table["rows"]):
            html += '  <tr>\n'
            
            for col_idx, text in enumerate(row):
                cell_key = f"cell_{row_idx}_{col_idx}"
                if cell_key in rendered:
                    continue
                
                cell_data = table["cells"].get(cell_key, {})
                style = cell_data.get("style", {})
                
                css = ["border:1px solid #475569", "padding:6px 10px"]
                
                if style.get("backgroundColor"):
                    css.append(f"background-color:{style['backgroundColor']}")
                if cell_data.get("isHeader"):
                    css.append("font-weight:bold")
                    css.append("background:#1e293b")
                    css.append("color:#e2e8f0")
                
                tag = "th" if cell_data.get("isHeader") else "td"
                
                style_str = ";".join(css)
                html += f'    <{tag} style="{style_str}">{text or "&nbsp;"}</{tag}>\n'
            
            html += '  </tr>\n'
        
        html += '</table>'
        html_parts.append({
            "tableIndex": t_idx,
            "html": html,
            "rowCount": len(table["rows"]),
            "colCount": len(table["columns"]),
        })
    
    return html_parts


def build_form_builder_table(table):
    """Build a table field config for Form Builder."""
    rows = table["rows"]
    columns = table["columns"]
    
    html_parts = generate_html([table])
    full_html = html_parts[0]["html"] if html_parts else ""
    
    fb_rows = []
    for row_idx, row in enumerate(rows):
        label = row[0] if row and row[0] else f"Row {row_idx}"
        name = re.sub(r'[^a-z0-9]+', '_', label.lower()).strip('_')
        fb_rows.append({
            "id": f"row_{row_idx}",
            "label": label,
            "name": name,
            "rowStyles": {}
        })
    
    col_names = [col["name"] for col in columns]
    
    cell_configs = {}
    for cell_key, cell_data in table["cells"].items():
        style = cell_data.get("style", {})
        if cell_data.get("isHeader") or style.get("backgroundColor"):
            cell_configs[cell_key] = {
                "type": "text",
                "dbName": "",
                "label": cell_data["text"],
                "fontStyle": "bold" if cell_data.get("isHeader") else "normal",
                "fontSize": "normal",
                "options": [],
                "trainerRole": ""
            }
    
    return {
        "id": f"imported_pdf_table_{int(time.time() * 1000)}",
        "type": "imported_html",
        "label": "PDF Table",
        "name": "pdf_table",
        "generatedHtml": full_html,
        "cellConfigs": cell_configs,
        "columns": col_names,
        "columnTypes": ["text"] * len(col_names),
        "rows": fb_rows
    }


def main():
    parser = argparse.ArgumentParser(description="Extract tables from PDF with styles")
    parser.add_argument("pdf", help="Path to PDF file")
    parser.add_argument("--output", "-o", help="Output JSON file")
    parser.add_argument("--html", action="store_true", help="Generate HTML output")
    parser.add_argument("--page", type=int, help="Extract only from page number")
    parser.add_argument("--table", type=int, help="Extract only table at index")
    parser.add_argument("--form-builder", action="store_true", help="Output Form Builder config")
    parser.add_argument("--pretty", action="store_true", default=True)
    
    args = parser.parse_args()
    
    if not os.path.exists(args.pdf):
        print(f"Error: File not found: {args.pdf}", file=sys.stderr)
        sys.exit(1)
    
    tables = extract_tables_from_pdf(args.pdf, page_num=args.page, table_index=args.table)
    
    if not tables:
        print("No tables found in PDF", file=sys.stderr)
        sys.exit(1)
    
    print(f"Found {len(tables)} table(s)", file=sys.stderr)
    for i, t in enumerate(tables):
        print(f"  Table {i}: {t['rowCount']} rows x {t['colCount']} cols", file=sys.stderr)
    
    output = {"source": args.pdf, "tables": tables}
    
    if args.html:
        output["html"] = generate_html(tables)
    
    if args.form_builder:
        output["formBuilderTables"] = [build_form_builder_table(t) for t in tables]
    
    json_str = json.dumps(output, indent=2 if args.pretty else None, ensure_ascii=False)
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(json_str)
        print(f"Saved to {args.output}", file=sys.stderr)
    else:
        print(json_str)


if __name__ == "__main__":
    main()
