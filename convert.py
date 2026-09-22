import re

with open('ManusBuild/fiosra-mvp (1)/client/src/pages/Home.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

preview_match = re.search(r'function HomeProductPreview\(\) \{\s*return \(\s*(<div.*?)\s*\);\s*\}', text, re.DOTALL)
preview_jsx = preview_match.group(1)

home_match = re.search(r'export default function HomePage\(\) \{\s*const loop = \[.*?\];\s*return \(\s*(<div.*?)\s*\);\s*\}', text, re.DOTALL)
home_jsx = home_match.group(1)

home_jsx = home_jsx.replace('<HomeProductPreview />', preview_jsx)

svelte_html = home_jsx.replace('className=', 'class=')
svelte_html = svelte_html.replace('<Link href=', '<a href=').replace('</Link>', '</a>')
svelte_html = svelte_html.replace('href="/"', 'href="#/"')
svelte_html = svelte_html.replace('href="/student/now"', 'href="#/student/now"')
svelte_html = svelte_html.replace('href="/educator/workspace"', 'href="#/courses"')

svelte_html = re.sub(
    r'\{loop\.map\(\(item, index\) => \(\s*(<article.*?</article>)\s*\)\)\}',
    r'{#each loop as item, index}\n\1\n{/each}',
    svelte_html,
    flags=re.DOTALL
)
svelte_html = svelte_html.replace('key={item.number}', '')
svelte_html = svelte_html.replace('{index < loop.length - 1 && ', '{#if index < loop.length - 1}')
svelte_html = svelte_html.replace('md:block\">+\'</span>}', 'md:block\">→</span>{/if}')
svelte_html = svelte_html.replace('+\'', '→')
svelte_html = svelte_html.replace('?o', '“').replace('??', '”').replace('?T', '’')
svelte_html = svelte_html.replace('Fiosra A', 'Fiosra —')
svelte_html = svelte_html.replace('var(--color-', 'var(--m-color-')

script = """<script>
  import InstitutionalFooter from '../lib/InstitutionalFooter.svelte';
  import { ArrowDown, ArrowRight, GraduationCap, Lightbulb } from 'lucide-svelte';

  const FIOSRA_LOCKUP_URL = "/manus-storage/fiosra-lockup-source_8b49614c.png";
  const FIOSRA_SYMBOL_URL = "/manus-storage/fiosra-symbol-source_88e00f09.png";

  const loop = [
    { number: "01", title: "Context", text: "Course, assignment, materials, rubric and policy create a credible place to begin." },
    { number: "02", title: "Learning", text: "Students write, inspect and explore within the work rather than leaving it for a generic chat." },
    { number: "03", title: "Development", text: "Fiosra recognises meaningful changes in reasoning without claiming to observe everything." },
    { number: "04", title: "Evidence", text: "Qualifying work is captured with provenance so it can be interpreted in academic context." },
    { number: "05", title: "Understanding", text: "Students review their Development Trace. Educators see evidence with context, not an activity dashboard." },
  ];
</script>

"""

with open('frontend/src/routes/Home.svelte', 'w', encoding='utf-8') as f:
    f.write(script + svelte_html)

