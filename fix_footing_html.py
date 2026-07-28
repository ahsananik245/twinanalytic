import re

with open('footing-design.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Make sure all scripts are loaded correctly
content = content.replace(
    '<script src="js/footing-design.js"></script>', 
    '<script src="js/calculators.js"></script>\n  <script src="js/footing-design.js"></script>'
)

with open('footing-design.html', 'w', encoding='utf-8') as f:
    f.write(content)
