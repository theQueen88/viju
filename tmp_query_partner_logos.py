import sqlite3, pathlib
p = pathlib.Path('data/vidream.db')
print('db_exists=', p.exists())
conn = sqlite3.connect(str(p))
cur = conn.cursor()
cur.execute("select config_key, config_value from site_config where config_key=?", ('partner_logos',))
rows = cur.fetchall()
for r in rows:
    print(r[0], r[1])
conn.close()
