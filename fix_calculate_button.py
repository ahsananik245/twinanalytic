import re

with open("js/footing-design.js", "r", encoding="utf-8") as f:
    content = f.read()

# Make sure it hooks properly on DOM load (just like calculators.js does)
event_hook = """
document.addEventListener('DOMContentLoaded', () => {
  const btnFooting = document.getElementById('btn-calc-footing');
  if (btnFooting) {
    btnFooting.addEventListener('click', calculateFooting);
  }
});
"""

if "btn-calc-footing" not in content:
    with open("js/footing-design.js", "a", encoding="utf-8") as f:
        f.write(event_hook)

