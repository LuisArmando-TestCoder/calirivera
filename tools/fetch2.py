# usage: fetch2.py <legacydir> <budget_seconds>
import json,sys,os,time,hashlib,urllib.request,re
base=sys.argv[1]; budget=float(sys.argv[2]); t0=time.time()
inv=json.load(open(f'{base}/urls.json'))
def prio(e):
    u=e['url']; mt=e['mimetype']
    if 'pdf' in mt and e['last200']: return 0
    if not e['relevant'] or not e.get('canonical'): return None
    if re.search(r'historico(\.html)?\?start=|videos\?start=|actividades\?start=',u): return 3
    if re.search(r'index\.php/(obras|cali-rivera-74|taller-del-artista|videos|historico|mi-obra|mi-vision|\d+-)',u): return 1
    if e['last200']>='2012': return 2
    return 2
todo=sorted([(p,e) for e in inv if (p:=prio(e)) is not None],key=lambda x:(x[0],x[1]['url']))
os.makedirs(f'{base}/html',exist_ok=True); os.makedirs(f'{base}/pdf',exist_ok=True)
log=open(f'{base}/fetch_html.log','a')
def name(e):
    return hashlib.md5(e['url'].encode()).hexdigest()[:8]+'_'+re.sub(r'[^A-Za-z0-9._-]+','_',e['url'])[-100:]
idx={}; done=0; left=0
from concurrent.futures import ThreadPoolExecutor
jobs=[]
for p,e in todo:
    sub='pdf' if 'pdf' in e['mimetype'] else 'html'
    fn=os.path.join(base,sub,name(e)); idx[e['url']]=sub+'/'+os.path.basename(fn)
    if os.path.exists(fn) and os.path.getsize(fn)>0: continue
    jobs.append((e,fn))
def work(arg):
    global done
    e,fn=arg
    if time.time()-t0>budget: return 0
    url=f"https://web.archive.org/web/{e['last200']}id_/{e['original']}"
    for a in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (archival recovery for site owner)'}),timeout=30) as r:
                open(fn,'wb').write(r.read()); log.write(f'ok {url}\n'); log.flush(); time.sleep(1); return 1
        except Exception as ex:
            log.write(f'err{a} {url} {ex}\n'); log.flush(); time.sleep(3*(2**a))
    return 0
with ThreadPoolExecutor(2) as ex: done=sum(ex.map(work,jobs))
left=sum(1 for e,fn in jobs if not os.path.exists(fn))
json.dump(idx,open(f'{base}/_index.json','w'),indent=1)
print('fetched',done,'remaining',left,'total',len(todo))
