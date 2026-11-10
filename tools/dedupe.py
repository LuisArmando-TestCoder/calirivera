import json,re,sys
base=sys.argv[1]
inv=json.load(open(f'{base}/urls.json'))
def key(u):
    m=re.search(r'[?&]id=(\d+)',u) 
    if m and 'view=article' in u or (m and 'task=view' in u and 'content' in u): return 'art:'+m.group(1)
    last=u.split('?')[0].rstrip('/').split('/')[-1]
    m=re.match(r'(\d+)-[a-z]',last)
    if m and 'index.php' in u: return 'art:'+m.group(1)
    p=re.sub(r'\.html$','',u.split('?')[0]).rstrip('/')
    p=re.sub(r'/(index\.php/)?cali-rivera-74','/index.php/cali-rivera-74',p)
    q=re.search(r'start=\d+',u)
    return 'page:'+p+('?'+q.group(0) if q else '')
best={}
for e in inv:
    if not e['relevant'] and 'pdf' not in e['mimetype']: continue
    if not e['last200']: continue
    k=key(e['url']) if 'pdf' not in e['mimetype'] else 'pdf:'+e['url']
    e['key']=k
    if k not in best or e['last200']>best[k]['last200']: best[k]=e
for e in inv: e['canonical']= e.get('key') is not None and best.get(e.get('key')) is e
json.dump(inv,open(f'{base}/urls.json','w'),ensure_ascii=False,indent=1)
import collections
print(len(best), collections.Counter(k.split(':')[0] for k in best))
