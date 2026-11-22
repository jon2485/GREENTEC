# Extracts the approved v2 template (greentec-three + our iterations) into tokenized fragments
# used by the Next.js storefront. Run locally: python3 tools/extract_tpl.py <v2-dir> <seed.json.gz>
import re, json, sys, gzip
V2, SEED = sys.argv[1], sys.argv[2]
seed = json.load(gzip.open(SEED, 'rt'))
cats = seed['categories']
def rd(f): return open(f'{V2}/{f}', encoding='utf-8').read()

def balanced(html, i):
    """i = index of '<div' opening tag; returns (inner_start, inner_end, end)"""
    j = html.index('>', i) + 1; depth = 1; k = j
    for m in re.finditer(r'<div\b|</div>', html[j:]):
        depth += 1 if m.group(0) != '</div>' else -1
        if depth == 0:
            e = j + m.start(); return j, e, e + 6
    raise ValueError('unbalanced')

def tokenize(html, marker, token, start=0):
    i = html.index(marker, start); a, e, _ = balanced(html, i)
    return html[:a] + token + html[e:]

PAGEMAP = {'./index.html': '/', './jewish_music.html': '/מוזיקה-יהודית', './audio_cds.html': '/תקליטורי-שמע', './accessories.html': '/אביזרים',
  './judaica_games.html': '/יודאיקה', './login.html': '/login', './signup.html': '/signup', './personal_profile.html': '/account',
  './shopping_cart.html': '/cart', './payment.html': '/checkout', './articles.html': '/articles', './page_list.html': '/'}
def links(h):
    for k, v in PAGEMAP.items(): h = h.replace(f'href="{k}"', f'href="{v}"')
    h = h.replace('https://www.greentec.co.il/', '/').replace('./assets/', '/t/assets/').replace('"./vendor/', '"/t/vendor/')
    return h

idx = rd('index.html')
home = idx[idx.index('<!-- Hero Section Start -->'):idx.index('<!-- Footer Start -->')]
home = tokenize(home, '<div class="album-grid">', '{{MUSIC}}')
home = tokenize(home, '<div class="movies-grid">', '{{MOVIES}}')
for sec, tok in [('<!-- Judaica Section Start -->', '{{JUDAICA}}'), ('<!-- Games Section Start -->', '{{GAMES}}'),
                 ('<!-- Accessories Section Start -->', '{{ACCESSORIES}}'), ('<!-- Recent Articles Section Start -->', '{{ARTICLES}}')]:
    home = tokenize(home, '<div class="main-carousel"', tok, home.index(sec))
# movie type chips -> real sub categories of "סרטים - DVD" (79)
sub79 = [c for c in cats if c['parentId'] == 79]
def typ(m):
    label = m.group(2).strip(); hit = next((c for c in sub79 if label in c['name']), None)
    return m.group(0).replace('href="#"', f'href="/{hit["url"]}"' if hit else 'href="/סרטים-לילדים"', 1)
home = re.sub(r'<a href="#" class="d-flex flex-column type[^"]*">(.*?)<p class="type-text">([^<]+)</p>', typ, home, flags=re.S)
home = home.replace('<a href="#" class="btn btn-secondary">למוצרים החדשים', '<a href="/search?sort=new" class="btn btn-secondary">למוצרים החדשים')
home = home.replace('<a href="#" class="btn btn-primary">התחברות</a>', '<a href="/login" class="btn btn-primary">התחברות</a>').replace('<a href="#" class="btn btn-outline-primary">הרשמה</a>', '<a href="/signup" class="btn btn-outline-primary">הרשמה</a>')
home = links(home)
scripts = re.findall(r'<script>\s*(\{.*?)</script>', idx[idx.index('<!-- Footer End -->'):], re.S)

def svg_after(html, marker):
    i = html.index(marker); a = html.index('<svg', i); return html[a:html.index('</svg>', a) + 6]
icons = {}
icons['albumEye'] = svg_after(idx, 'class="album-eye"'); icons['albumCart'] = svg_after(idx, 'class="album-cart"')
j = idx.index('<!-- Judaica Section Start -->')
icons['itemEye'] = svg_after(idx[j:], 'class="btn btn-primary"'); icons['itemCart'] = svg_after(idx[j:], 'class="btn btn-accent"')
icons['date'] = svg_after(idx, 'class="d-flex date-box"')
shop = rd('jewish_music.html')
for k, m in [('pin', 'class="shop-pin"'), ('wish', 'class="shop-icon wish"'), ('shopCart', 'class="shop-cart"'), ('grid', 'data-view="grid"'), ('list', 'data-view="list"')]:
    icons[k] = svg_after(shop, m)
icons['shopEye'] = svg_after(shop, 'class="shop-icon" data-qv')
pp = rd('product_page.html')
opt = [m.start() for m in re.finditer('class="pp-opt-ic"', pp)]
icons['optDigital'] = svg_after(pp[opt[0]:], 'pp-opt-ic'); icons['optBoth'] = svg_after(pp[opt[1]:], 'pp-opt-ic')
for k, m in [('ppAdd', 'id="ppAdd"'), ('ppWish', 'id="ppWish"'), ('ship', 'class="pp-ship"'), ('wa', 'שיתוף בוואטסאפ'), ('fb', 'שיתוף בפייסבוק'), ('mail', 'שליחה במייל')]:
    icons[k] = svg_after(pp, m)
ppScript = re.findall(r'<script>\s*(\{.*?)</script>', pp[pp.index('<!-- Footer End -->'):], re.S)[-1]
cart = rd('shopping_cart.html')
for k, m in [('trash', 'class="trash-icon'), ('minus', 'btn-minus'), ('plus', 'btn-plus')]: icons[k] = svg_after(cart, m)

def body(f):
    s = rd(f); return links(s[s.index('<!-- Content Section Start -->'):s.index('<!-- Footer Start -->')])
pages = {f.replace('.html', ''): body(f) for f in ['shopping_cart.html', 'login.html', 'signup.html', 'personal_profile.html', 'payment.html', 'articles.html', 'articles_details.html']}
out = {'home': home, 'homeScripts': scripts, 'icons': icons, 'ppScript': ppScript, 'pages': pages}
json.dump(out, open(sys.argv[3], 'w', encoding='utf-8'), ensure_ascii=False)
print('home', len(home), 'tokens', re.findall(r'\{\{\w+\}\}', home), 'icons', len(icons), 'scripts', len(scripts), {k: len(v) for k, v in pages.items()})
