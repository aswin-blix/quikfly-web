"""Turn a Next.js static export (single page) into one self-contained HTML file."""
import base64, re, sys, pathlib
out = pathlib.Path(sys.argv[1]); dest = pathlib.Path(sys.argv[2])
html = (out / "index.html").read_text()

def read(p): return (out / p.lstrip("/")).read_text()

html = re.sub(r'<link rel="preload"[^>]*as="(?:script|image)"[^>]*/>', "", html)
html = re.sub(r'<link rel="preload" as="image"[^>]*/>', "", html)
html = re.sub(r'<link rel="stylesheet" href="(/_next/[^"]+\.css)"[^>]*/>',
              lambda m: "<style>" + read(m.group(1)) + "</style>", html)
def script(m):
    js = read(m.group(1)).replace("</script", "<\\/script")
    return "<script>" + js + "</script>"
html = re.sub(r'<script src="(/_next/[^"]+\.js)"[^>]*></script>', script, html)

# React re-inserts the stylesheet from the RSC payload; point it at an empty CSS (real CSS is inlined above).
html = re.sub(r'/_next/static/(?:css|chunks)/[\w-]+\.css', 'data:text/css,%2F*inlined*%2F', html)

for img in sorted((out / "assets").iterdir()):
    mime = "image/jpeg" if img.suffix == ".jpg" else "image/png"
    uri = f"data:{mime};base64," + base64.b64encode(img.read_bytes()).decode()
    html = html.replace(f"/assets/{img.name}", uri)

left = re.findall(r'(?:src|href)="/_next[^"]*"', html)
html = html.replace("\ufffd", "\\uFFFD")  # only occurs inside JS string literals
dest.write_text(html)
print("bytes", len(html), "unresolved", left[:5])
