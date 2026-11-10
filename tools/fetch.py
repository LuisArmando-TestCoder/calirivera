import json,sys,os,time,hashlib,urllib.request,re
base=sys.argv[1]; kind=sys.argv[2] if len(sys.argv)>2 else 'html'
inv=json.load(open(f'{base}/urls.json'))
if kind=='html':
    todo=[e for e in inv if e['relevant']]; outdir=f'{base}/html'
else:
    todo=[e for e in inv if e['mimetype'].startswith('image/') and e['last200']]; outdir=f'{base}/assets/raw'
os.makedirs(outdir,exist_ok=True)
log=open(f'{base}/fetch_{kind}.log','a')
def name(e):
    s=re.sub(r'[^A-Za-z0-9._-]+','_',e['url'])[-120:]
    return hashlib.md5(e['url'].encode()).hexdigest()[:8]+'_'+s
idx={}
for i,e in enumerate(todo):
    fn=os.path.join(outdir,name(e)); idx[e['url']]=os.path.basename(fn)
    if os.path.exists(fn) and os.path.getsize(fn)>0: continue
    url=f"https://web.archive.org/web/{e['last200']}id_/{e['original']}"
    for a in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (archival recovery for site owner)'}),timeout=40) as r:
                open(fn,'wb').write(r.read()); log.write(f'ok {i} {url}\n'); break
        except Exception as ex:
            log.write(f'err{a} {i} {url} {ex}\n'); log.flush(); time.sleep(5*(2**a))
    log.flush(); time.sleep(0.8)
json.dump(idx,open(f'{outdir}/_index.json','w'),indent=1)
log.write('DONE\n'); log.close()
