import urllib.request
import urllib.parse
import json

def test_role(role: str):
    input_data = {"0": {"json": {"role": role}}}
    url = "http://localhost:3000/api/trpc/foundation.getBootstrap?batch=1&input=" + urllib.parse.quote(json.dumps(input_data))
    req = urllib.request.urlopen(url)
    res = json.loads(req.read().decode("utf-8"))
    payload = res[0]["result"]["data"]["json"]
    print(f"Role: {role} -> Course: {payload['course']['title']} ({payload['course']['code']}), Workspace: {payload['workspace']['name']}, Profile: {payload['currentProfile']['displayName']}")

test_role("student")
test_role("educator")
