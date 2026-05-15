import pathlib, json, re
p = pathlib.Path('data/vidream.db')
import sqlite3
conn = sqlite3.connect(str(p))
cur = conn.cursor()
cur.execute("select config_value from site_config where config_key=?", ('partner_logos',))
row = cur.fetchone()
items = json.loads(row[0]) if row and row[0] else []
for item in items:
    url = item.get('image_url','')
    rel = url.replace('/images/','') if url.startswith('/images/') else None
    fp = pathlib.Path('src/main/resources/static/images') / rel if rel else None
    print(url, '=>', fp.exists() if fp else None, str(fp) if fp else '')
conn.close()
