# Parse archived HTML (untrusted data) -> legacy/content/*.json. Never executes anything.
import json,re,sys,os,collections
from bs4 import BeautifulSoup
base=sys.argv[1]
inv={e['url']:e for e in json.load(open(f'{base}/urls.json'))}
idx=json.load(open(f'{base}/_index.json'))
SPAM=re.compile(r'(?i)\b(viagra|cialis|levitra|porn|xxx|bitcoin|forex|replica watches|payday loan|slot gacor|judi|togel|betting|crypto casino|escort)\b')
SUS_SCRIPT=re.compile(r'(?i)(eval\(|atob\(|fromCharCode|document\.write\(unescape|base64,)')
os.makedirs(f'{base}/content',exist_ok=True)
items=[]; hack=[]
def section(u):
    for k,v in [('/obras','obras'),('exposiciones','exposiciones'),('puntos-de-vista','prensa'),('curriculum','biografia'),('biografia','biografia'),('mi-vision','manifiesto'),('mi-obra','obras'),('/videos','videos'),('actividades','actividades_taller'),('recomendaciones','recomendaciones'),('cafe-arte','cafe_arte'),('taller-del-artista','taller'),('historico','historico'),('rsgallery','galeria'),('galeria','galeria'),('actividades_popup','actividades_taller')]:
        if k in u: return v
    return 'otros'
for url,rel in idx.items():
    if not rel.startswith('html/'): continue
    p=f'{base}/{rel}'
    if not os.path.exists(p): continue
    raw=open(p,'rb').read().decode('utf-8',errors='replace')
    if raw.count('�')>20: raw=open(p,'rb').read().decode('latin-1')
    soup=BeautifulSoup(raw,'lxml')
    flags=[]
    for s in soup.find_all('script'):
        t=s.string or ''
        if SUS_SCRIPT.search(t) or (s.get('src') and not re.search(r'calirivera|tallerdelartista|google|jquery|gstatic|facebook|twitter|addthis|youtube|^/|^[a-z]',s['src'])): flags.append('script:'+(s.get('src') or t[:80]))
        s.decompose()
    for st in soup(['style','noscript','iframe']):
        if st.name=='iframe' and st.get('src'): flags.append('iframe:'+st['src']) if not re.search(r'youtube|vimeo|google|facebook|issuu',st['src']) else None
        if st.name=='iframe' and re.search(r'youtube|vimeo|issuu',st.get('src','')): st.replace_with(soup.new_string(' [EMBED '+st['src']+'] '))
        else: st.decompose()
    for h in soup.select('[style*="display:none"],[style*="display: none"],[style*="visibility:hidden"]'):
        if h.find('a') and SPAM.search(h.get_text(' ')): flags.append('hidden-spam:'+h.get_text(' ')[:80]); h.decompose()
    main=None
    for sel in ['div.item-page','div.article-content','div.blog','div.blog-featured','div.component-content','#rt-mainbody','#content','td.contentpane','table.contentpaneopen','body']:
        main=soup.select_one(sel)
        if main: break
    if main is None: main=soup
    for a in main.find_all('a'):
        if SPAM.search(a.get_text(' ')+' '+a.get('href','')): flags.append('spam-link:'+a.get('href','')); a.decompose()
    title=(main.find(['h1','h2']) or soup.title)
    title=title.get_text(' ',strip=True) if title else ''
    text=re.sub(r'\n{3,}','\n\n',main.get_text('\n',strip=True))
    if SPAM.search(text): flags.append('spam-text')
    imgs=[]
    for im in main.find_all('img'):
        src=im.get('src','')
        if not src or re.search(r'(icon|pdf_button|printButton|emailButton|blank|spacer|arrow)',src,re.I): continue
        imgs.append({'src':src,'alt':im.get('alt',''),'title':im.get('title','')})
    links=[{'href':a.get('href'),'text':a.get_text(' ',strip=True)} for a in main.find_all('a') if a.get('href') and not a.get('href').startswith('#')]
    e=inv.get(url,{})
    it={'url':url,'snapshot':e.get('last200'),'archive':f"https://web.archive.org/web/{e.get('last200')}/{e.get('original')}",'section':section(url),'title':title,'text':text,'images':imgs,'links':links[:60],'flags':flags}
    items.append(it)
    if flags: hack.append({'url':url,'flags':flags})
by=collections.defaultdict(list)
for it in items: by[it['section']].append(it)
for k,v in by.items(): json.dump(sorted(v,key=lambda x:x['url']),open(f'{base}/content/{k}.json','w'),ensure_ascii=False,indent=1)
json.dump(hack,open(f'{base}/content/_hack_flags.json','w'),ensure_ascii=False,indent=1)
print({k:len(v) for k,v in by.items()}, 'flagged',len(hack))
