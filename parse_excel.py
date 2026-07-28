import zipfile
import xml.etree.ElementTree as ET
import sys

def parse_excel(path):
    def get_shared_strings(z):
        try:
            ss_xml = z.read('xl/sharedStrings.xml')
            root = ET.fromstring(ss_xml)
            ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            return [t.text for t in root.findall('.//ns:t', ns)]
        except:
            return []

    with zipfile.ZipFile(path, 'r') as z:
        strings = get_shared_strings(z)
        sheet_xml = z.read('xl/worksheets/sheet1.xml')
        root = ET.fromstring(sheet_xml)
        ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        
        result = []
        for row in root.findall('.//ns:row', ns):
            row_data = []
            row_idx = row.get('r')
            for c in row.findall('.//ns:c', ns):
                cell_ref = c.get('r')
                v = c.find('ns:v', ns)
                f = c.find('ns:f', ns)
                
                cell_val = None
                if f is not None:
                    cell_val = f'FORMULA: {f.text}'
                elif v is not None:
                    val = v.text
                    if c.get('t') == 's':
                        idx = int(val)
                        if idx < len(strings):
                            val = strings[idx]
                    cell_val = val
                
                if cell_val is not None:
                    row_data.append(f"{cell_ref}: {cell_val}")
                    
            if row_data:
                result.append(f"Row {row_idx}: " + " | ".join(row_data))
        return "\n".join(result)

print(parse_excel(sys.argv[1]))
