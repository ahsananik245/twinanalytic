import re

with open("js/calculators.js", "r", encoding="utf-8") as f:
    content = f.read()

# Replace the triggerUnlockFlow to be generic
new_flow = """function triggerUnlockFlow() {
  const calcBtn = document.querySelector('.btn-calc');
  if (calcBtn) {
    calcBtn.click();
  } else {
    openAuthModal(null, 'Calculator Unlock');
  }
}"""

content = re.sub(r'function triggerUnlockFlow\(\) \{[\s\S]*?(?=\n\})', new_flow[:-1], content)

with open("js/calculators.js", "w", encoding="utf-8") as f:
    f.write(content)
