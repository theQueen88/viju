import json, urllib.request
with urllib.request.urlopen('http://localhost:9091/api/config') as r:
    data = json.loads(r.read().decode('utf-8'))
print(data.get('success'))
raw = (data.get('data') or {}).get('partner_logos')
print(raw)
