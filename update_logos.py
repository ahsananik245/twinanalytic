import os
import re

directory = r"C:\Users\pc\.gemini\antigravity\scratch\twinanalytic"
html_files = [f for f in os.listdir(directory) if f.endswith('.html')]

# We want to match:
# <a href="..." class="logo">
#   Twin<span>Analytic</span>
# </a>
# allowing for arbitrary whitespaces/newlines.

pattern = re.compile(
    r'(<a\s+href="[^"]*"\s+class="logo"[^>]*>)\s*Twin<span>Analytic</span>\s*(</a>)',
    re.IGNORECASE | re.DOTALL
)

replacement = r'''\1
        <img src="assets/logo.png" alt="TwinAnalytic Logo" style="height: 38px; width: auto; border-radius: 4px; margin-right: 8px; vertical-align: middle;">
        Twin<span>Analytic</span>
      \2'''

for filename in html_files:
    filepath = os.path.join(directory, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content, count = pattern.subn(replacement, content)
    if count > 0:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated logo in: {filename} ({count} occurrences)")
    else:
        print(f"No match found in: {filename}")
