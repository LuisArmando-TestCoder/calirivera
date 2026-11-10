import json,re,sys,os,glob,time,hashlib,urllib.request
from urllib.parse import urljoin,unquote
from concurrent.futures import ThreadPoolExecutor
base=sys.argv[1]; budget=float(sys.argv[2]); t0=time.time()
inv={e['url']:e for e in json.load(open(f'{base}/urls.json'))}
def canon(u): return re.sub(r'^https?://(www\.)?','',u).replace(':80/','/').split('#')[0]
want={}
for f in glob.glob(f'{base}/content/*.json'):
    if f.endswith('_hack_flags.json'): continue
    for it in json.load(open(f)):
        for im in it['images']:
            src=im['src']
            if src.startswith('data:'): continue
            absu=urljoin('http://'+it['url'],src)
            absu=re.sub(r'https?://web\.archive\.org/web/\d+(im_|id_)?/','',absu)
            c=canon(absu).replace('//','/')
            for k in (c,unquote(c)):
                if k in inv and inv[k]['last200']: want[k]=inv[k]; break
            else: want.setdefault('MISSING:'+c,None)
miss=[k for k,v in want.items() if v is None]; got={k:v for k,v in want.items() if v}
os.makedirs(f'{base}/assets',exist_ok=True)
def fn(k): 
    ext=os.path.splitext(k.split('?')[0])[1][:5] or '.jpg'
    return f'{base}/assets/'+hashlib.md5(k.encode()).hexdigest()[:8]+'_'+re.sub(r'[^A-Za-z0-9._-]+','_',os.path.basename(k.split('?')[0]))[-60:]
def work(item):
    k,e=item; p=fn(k)
    if os.path.exists(p) or time.time()-t0>budget: return 0
    for a in range(3):
        try:
            with urllib.request.urlopen(f"https://web.archive.org/web/{e['last200']}id_/{e['original']}",timeout=30) as r: open(p,'wb').write(r.read()); time.sleep(0.8); return 1
        except Exception: time.sleep(3*2**a)
    return 0
with ThreadPoolExecutor(3) as ex: n=sum(ex.map(work,got.items()))
json.dump({k:os.path.basename(fn(k)) for k in got},open(f'{base}/assets/_index.json','w'),indent=1)
json.dump(sorted(m[8:] for m in miss),open(f'{base}/assets/_missing.json','w'),indent=1)
print('referenced',len(want),'archived',len(got),'missing',len(miss),'fetched now',n,'have',len([k for k in got if os.path.exists(fn(k))]))
