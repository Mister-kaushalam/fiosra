import re
import glob

def fix_file(path):
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        s = f.read()
    
    replacements = {
        'o"': '✨',
        'dY",': '📄',
        'dY"s': '📚',
        '+': '⚡',
        'dY"': '🎯',
        '+?': '←',
        '+\'': '→',
        '?': '...',
    }
    
    for k, v in replacements.items():
        s = s.replace(k, v)
        
    with open(path, 'w', encoding='utf-8') as f:
        f.write(s)

fix_file('frontend/src/routes/Courses.svelte')
fix_file('frontend/src/routes/CourseStudio.svelte')
print("Fixed emojis.")

