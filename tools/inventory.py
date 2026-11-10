import json,re,sys,collections
base=sys.argv[1]
rows=[]
for f in ['www.calirivera.com.json','tallerdelartista.com.json','calirivera.com.json']:
    try: rows+=json.load(open(f'{base}/cdx/{f}'))[1:]
    except Exception: pass
def canon(u):
    u=re.sub(r'^https?://(www\.)?','',u); u=u.replace(':80/','/').replace(':443/','/')
    return u.rstrip('?')
inv={}
for o,ts,st,mt in rows:
    k=canon(o)
    e=inv.setdefault(k,{'url':k,'original':o,'mimetype':mt,'first':ts,'last':ts,'last200':None,'statuses':[]})
    e['first']=min(e['first'],ts); e['last']=max(e['last'],ts)
    if st not in e['statuses']: e['statuses'].append(st)
    if st=='200' and (e['last200'] is None or ts>e['last200']): e['last200']=ts; e['original']=o
JUNK=re.compile(r'(administrator|com_events|shop\.|virtuemart|com_registration|com_user|register|lostPassword|addshout|getshouts|shoutit|com_banners|search|format=feed|/feed|\.css|\.js|com_akobook|com_easybook|com_mosforms|com_facileforms|com_letterman|com_acymailing|print=1|tmpl=component|wp-content/plugins|wp-includes|cgi-sys|limitstart|com_mailto|com_contact|robots\.txt|favicon)',re.I)
for e in inv.values():
    e['relevant']= e['mimetype']=='text/html' and e['last200'] is not None and not JUNK.search(e['url'])
json.dump(sorted(inv.values(),key=lambda e:e['url']),open(f'{base}/urls.json','w'),ensure_ascii=False,indent=1)
rel=[e for e in inv.values() if e['relevant']]
print(len(inv),'urls;',len(rel),'relevant html')
print(sorted(collections.Counter(e['last200'][:4] for e in rel).items()))
