import json,re,sys,csv
base=sys.argv[1]
inv=json.load(open(f'{base}/urls.json'))
COL={'atmosfera':'/atmosfera','musas-del-cantaro':'/musas-del-cantaro','suenos-en-azul':'/suenos-en-azul','detras-de-la-ventana':'/detras-de-la-ventana','exvotos':'/exvotos','plegaria':'/plegaria','cofradia':'/la-cofradia'}
def target(u):
    p=u.split('/',1)[1] if '/' in u else ''
    for k,v in COL.items():
        if k in p: return v
    rules=[(r'curriculum|biografia|cali-rivera-74/?$|mi-vision|mi-obra','/biografia'),
           (r'puntos-de-vista|entrevista|videos','/trayectoria-and-entrevistas'),
           (r'exposiciones|historico|65-general','/trayectoria-and-entrevistas'),
           (r'obras|galeria|rsgallery|\d{3}-.*(catalogo|pdf|banderas|plegaria|exvotos|produccion|revelaciones|prayer|sincretismo)','/catalogos-and-proyectos'),
           (r'\.pdf$','/catalogos-and-proyectos'),
           (r'recomendaciones','/bitacora'),
           (r'actividades|agenda-cultural|taller-del-artista|cafe-arte|32-taller|52-actividades|cpael|tallerdelartista\.com','/taller-del-artista'),
           (r'^(index\.php|index\.html|index2\.html|)$|featured|frontpage','/')]
    for rx,t in rules:
        if re.search(rx,u if 'tallerdelartista.com' in u else p): return t
    return 'gone'
rows=[]
for e in inv:
    if e['mimetype'] not in('text/html','application/pdf'): continue
    if not e.get('relevant') and 'pdf' not in e['mimetype']:
        t='gone'
    else: t=target(e['url'])
    rows.append((e['url'],t,e.get('last200') or '',e['mimetype']))
with open(f'{base}/redirects.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['url_vieja','ruta_nueva_sugerida','ultimo_snapshot_200','tipo']); w.writerows(sorted(rows))
import collections; print(collections.Counter(r[1] for r in rows))
