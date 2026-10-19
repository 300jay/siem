import argparse
import ipaddress
import json
import math
import os
import re
import sys

from collections import Counter, defaultdict, deque
from datetime import datetime, timezone

SEVERITY_ORDER ={"low":1,"medium":2,"high":3,"critical":4}
RECV_IDS={11,43}

def base(path):
    if not path:
        return ""
    return str(path).replace("/","\\").rsplit("\\",1)[-1].lower()

def norm_path(path):
    p=str(path or "").replace("/","\\").lower()
    if p.startswith("\\?\\"):
        p=p[4:]
    if p.startswith("\\systemroot\\"):
        p="c:\\windows\\"+p[len("\\systemroot\\"):]
    return p
def parse_ts(ev):
    ts=ev.get("timestamp")
    try:
        return datetime.fromisoformat(str(ts).replace("Z","+00:")).timestamp()
    except (ValueError, TypeError):
        return datetime.now(timezone.utc).timestamp()

def event_uid(ev):
    return ev.get("uid") or ev.get("_uid")

def is_public_ip(ip):
    try:
        addr = ipaddress.ip_address(str(ip))
    except ValueError:
        return False
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
        addr = addr.ipv4_mapped
    return bool(addr.is_global and not (addr.is_multicast or addr.is_reserved or addr.is_loopback
                                        or addr.is_link_local or addr.is_unspecified))

def remote_ip(ev):
    try:
        eid = int(ev.get("events_id"))
    except (TypeError, ValueError):
        eid = None
    return ev.get("src_ip") if eid in RECV_IDS else ev.get("dst_ip")

def shannon(s):
    if not s:
        return 0.0
    counts = Counter(s)
    n=len(s)
    return -sum(c/n*math.log2(c/n) for c in counts.values())

def second_level_label(name):
    labels = name.rstrip(".").lower().split(".")
    if len(labels) <2:
        return None
    if len(labels) >= 3 and len(labels[-1]) == 2 and labels[-2] in ("co", "com", "org", "net", "gov", "ac"):
        return labels[-3]
    return labels[-2]

def has_suffix(name, suffixes):
    padded = "."+name.rstrip(".").lower()
    return any(padded.endswith(s) for s in suffixes)

def _lower_list(v):
    return [str(x).lower() for x in v]

MATCH_OPS = {
    "image_in":                  (_lower_list, lambda ev, v: base(ev.get("image")) in v),
    "parent_image_in":           (_lower_list, lambda ev, v: base(ev.get("parent_image")) in v),
    "image_path_contains_any":   (_lower_list, lambda ev, v: any(s in norm_path(ev.get("image")) for s in v)),
    "image_regex":               (lambda v: re.compile(v, re.I), lambda ev, v: bool(v.search(base(ev.get("image"))))),
    "command_line_contains_any": (_lower_list, lambda ev, v: any(s in (ev.get("command_line") or "").lower() for s in v)),
    "command_line_regex":        (lambda v: re.compile(v, re.I), lambda ev, v: bool(v.search(ev.get("command_line") or ""))),
    "command_line_regex_any":    (lambda v: [re.compile(x, re.I) for x in v],
                                  lambda ev, v: any(r.search(ev.get("command_line") or "") for r in v)),
}

class RuleEngine:
    def __init__(self, rules_path="rules.json"):
        with open(rules_path, encoding="utf-8") as f:
            cfg = json.load(f)
        self.rules = [self._compile(r) for r in cfg["rules"] if r.get("enabled", True)]
        self.reset()

    def _compile(self, rule):
        rule = dict(rule)
        rule.setdefault("attack",[])
        rule.setdefault("params",{})
        if rule["severity"] not in SEVERITY_ORDER:
            raise ValueError(f"{rule['id']}: unknown severity {rule['severity']!r}")
        if rule["type"] == "match":
            rule.setdefault("cooldown",0)
            compiled = {}
            for op, value in rule["match"].items():
                if op not in MATCH_OPS:
                    raise ValueError(f"{rule['id']}: unknown match operator {op!r}")
                compiled[op]= MATCH_OPS[op][0](value)
            rule["_match"] = compiled
        elif rule["type"] == "builtin":
            rule.setdefault("cooldown", 300)
            fn = getattr(self, "_b_" + rule["builtin"], None)
            if fn is None:
                raise ValueError(f"{rule['id']}: no builtin named {rule['builtin']!r}")
            rule["_fn"] = fn
        else:
            raise ValueError(f"{rule['id']}: unknown rule type {rule['type']!r}")
        return rule

    def reset(self):
        self.procs = {}                          # pid -> info about a running/recently ended process
        self.watched = {}                        # pid -> (time, rule id) flagged by a 'watch' rule
        self.recon = defaultdict(deque)          # parent pid -> deque[(time, tool)]
        self.starts = defaultdict(deque)         # parent pid -> deque[time]
        self.dns_fail = defaultdict(deque)       # pid -> deque[(time, query, status)]
        self.last_fired = {}
        self._seq = 0
        self._count = 0

    def process_event(self, ev):
        kind = ev.get("event_type")
        t = parse_ts(ev)
        self._count +=1
        if kind in ("process_start", "process_snapshot"):
            self._track_process(ev, kind, t)
        elif kind == "process_end":
            proc = self.procs.get(ev.get("pid"))
            if proc:
                proc["end"] = t
        if self._count % 5000 ==0:
            self._purge(t)

        alerts = []
        for rule in self.rules:
            if kind not in rule["on"]:
                continue
            if rule["type"] == "match":
                if all(MATCH_OPS[op][1](ev, v) for op, v in rule["_match"].items()):
                    if rule.get("watch"):
                        self.watched[ev.get("pid")] = (t, rule["id"])
                    alerts += self._fire(rule, ev, t, key=(ev.get("pid"), ev.get("timestamp")), details={"command_line": ev.get("command_line"), "parent_image": ev.get("parent_image")})
            elif rule["type"] == "builtin":
                alerts += rule["_fn"](rule, ev, t)
        return alerts

    def _track_process(self, ev, kind, t):
        pid=ev.get("pid")
        self.procs[pid] = {"image": ev.get("image"), "parent_image": ev.get("parent_image"),"parent_pid": ev.get("parent_pid"), "command_line": ev.get("command_line"),"user": ev.get("user"), "start": t, "end": None,}
        if kind =="process_start":
            self.watched.pop(pid, None)

    def _purge(self, now):
        for pid in [p for p, i in self.procs.items() if i["end"] and now - i["end"]>3600]:
            del self.procs[pid]
        for pid in [p for p, (t0, _) in self.watched.items() if now -t0 > 3600]:
            del self.watched[pid]

    def _fire(self, rule, ev, t, key, details, uids=None):
        cooldown = rule.get("cooldown", 0)
        k=(rule["id"],key)
        last = self.last_fired.get(k)
        if cooldown and last is not None and t - last < cooldown:
            return []
        self.last_fired[k] = t
        self._seq +=1
        pid = ev.get("pid")
        proc = self.procs.get(pid,{})
        return [{
            "alert_id": f"A{self._seq:05d}",
            "timestamp": ev.get("timestamp"),
            "rule_id": rule["id"],
            "title": rule["title"],
            "severity": rule["severity"],
            "attack": rule["attack"],
            "host": ev.get("host"),
            "pid": pid,
            "image": ev.get("image") or proc.get("image"),
            "details": details,
            "event_uids": uids or [event_uid(ev)],
            "run_id": ev.get("run_id"),
        }]

    def _b_system_binary_wrong_path(self, rule, ev, t):
        spec = rule["params"]["binaries"].get(base(ev.get("image")))
        path = norm_path(ev.get("image"))
        if not spec or "\\" not in path:
            return []
        if any(path.startswith(p) for p in spec["path_prefixes"]):
            return []
        return self._fire(rule, ev, t, key=ev.get("pid"), details={"expected_parents": spec.get("parents"), "actual_parent": ev.get("parent_image")})

    def _b_system_binary_wrong_parent(self, rule, ev, t):
        spec = rule["params"]["binaries"].get(base(ev.get("image")))
        if not spec:
            return []
        parent = base(ev.get("parent_image"))
        if parent and parent not in [p.lower() for p in spec["parents"]]:
            return self._fire(rule, ev, t, key=ev.get("pid"), details={"expected_parents": spec["parents"], "actual_parent": ev.get("parent_image")})
        return []

    def _b_recon_burst(self, rule, ev, t):
        p = rule["params"]
        img = base(ev.get("image"))
        tools = [x.lower() for x in p.get("tools", [])]
        if img not in tools:
            return []
        parent = ev.get("parent_pid")
        dq = self.recon[parent]
        dq.append((t, img))
        while dq and t - dq[0][0] > p["window_sec"]:
            dq.popleft()
        distinct_tools = {tool for _, tool in dq}
        if len(distinct_tools) >= p["min_distinct"]:
            return self._fire(rule, ev, t, key=parent, details={"distinct_tools": list(distinct_tools), "parent_pid": parent, "parent_image": ev.get("parent_image")})
        return []

    def _b_process_burst(self, rule, ev, t):
        p=rule["params"]
        if base(ev.get("parent_image")) in p["exclude_parents"]:
            return []
        parent = ev.get("parent_pid")
        dq = self.starts[parent]
        dq.append(t)
        while dq and t - dq[0] > p["window_sec"]:
            dq.popleft()
        if len(dq) >= p["min_starts"]:
            return self._fire(rule, ev, t, key=parent, details={"starts_in_window": len(dq), "parent_pid": parent, "parent_image":ev.get("parent_image")})
        return []

    def _image_of(self, pid):
        return base((self.procs.get(pid) or {}).get("image"))

    def _public_remote(self, ev):
        ip = remote_ip(ev)
        return ip if is_public_ip(ip) else None

    def _b_lolbin_network(self, rule, ev, t):
        pid=ev.get("pid")
        if self._image_of(pid) not in rule["params"]["images"]:
            return []
        ip = self._public_remote(ev)
        if not ip:
            return []
        return self._fire(rule, ev, t, key=(pid,ip), details={"remote_ip":ip, "image": (self.procs.get(pid) or {}).get("image"), "dst_port":ev.get("dst_port"),"src_port":ev.get("src_port")})

    def _b_unexpected_network_process(self, rule, ev, t):
        pid = ev.get("pid")
        if self._image_of(pid) not in rule["params"]["images"]:
            return []
        ip = self._public_remote(ev)
        if not ip:
            return []
        return self._fire(rule, ev, t, key=(pid, ip), details={"remote_ip": ip, "image": (self.procs.get(pid) or {}).get("image"), "dst_port": ev.get("dst_port"), "src_port": ev.get("src_port")})

    def _b_spawn_then_connect(self, rule, ev, t):
        pid=ev.get("pid")
        watched = self.watched.get(pid)
        if not watched or t  - watched[0]>rule["params"]["window_sec"]:
            return []
        ip = self._public_remote(ev)
        if not ip:
            return []
        return self._fire(rule, ev, t, key=pid, details={"origin_rule": watched[1], "remote_ip": ip,
                                   "seconds_since_flagged": round(t - watched[0], 1),
                                   "image": (self.procs.get(pid) or {}).get("image")})

    def _b_dns_failure_storm(self, rule, ev, t):
        p=rule["params"]
        status = ev.get("query_status")
        if str(ev.get("event_id"))!="3008" or status is None or str(status) in p["ignore_status"]:
            return []
        pid=ev.get("pid")
        dq=self.dns_fail[pid]
        dq.append((t, ev.get("dns_query"), str(status)))
        while dq and t-dq[0][0] > p["window_sec"]:
            dq.popleft()
        if len(dq)>=p["min_failures"]:
            return self._fire(rule, ev, t, key=pid, details={"failures_in_window": len(dq), "window_sec": p["window_sec"],
                                       "top_queries": Counter(q for _, q, _ in dq).most_common(3),
                                       "statuses": dict(Counter(s for _, _, s in dq)),
                                       "image": (self.procs.get(pid) or {}).get("image")})
        return []

    def _b_dga_like_name(self, rule, ev, t):
        p=rule["params"]
        name = (ev.get("dns_query") or "").rstrip(".").lower()
        if str(ev.get("event_id")) !="3006" or not name or has_suffix(name, p["allow_suffixes"]):
            return []
        label = second_level_label(name)
        if not label or len(label)< p["min_len"]:
            return []
        vowel_ratio=sum(ch in "ariou" for ch in label) /len(label)     
        entropy = shannon(label)
        if entropy >= p["min_entropy"] and vowel_ratio <=p["max_vowel_ratio"]:
            return self._fire(rule, ev, t, key =(ev.get("pid"), label), details={"query": name, "label": label, "entropy": round(entropy, 2),
                                       "vowel_ratio": round(vowel_ratio, 2),
                                       "image": (self.procs.get(ev.get("pid")) or {}).get("image")})   
        return []

    def _b_dns_tunnel_shape(self, rule, ev, t):
        p=rule["params"]
        name = (ev.get("dns_query") or"").rstrip(".").lower()
        if str(ev.get("event_id")) != 3006 or not name or has_suffix(name,p["allow_suffixes"]):
            return []
        longest = max(len(label) for label in name.split("."))
        if len(name)>p["max_name_len"] or longest> p["max_label_len"]:
            return self._fire(rule, ev, t, key=(ev.get("pid"), second_level_label(name)),details={"query": name[:120], "name_len": len(name), "longest_label": longest,"image": (self.procs.get(ev.get("pid")) or {}).get("image")})
        return []
LOG_FILES =[("etw_process_events.json", "process"), ("etw_network_events.json", "network"),("etw_dns_events.json", "dns")]

def load_events(folder):
    events=[]
    for filename, tag in LOG_FILES:
        path=os.path.join(folder, filename)
        if not os.path.exists(path):
            print(f"(missing {filename})")
            continue
        with open(path, encoding="utf-8") as f:
            for lineno, line in enumerate(f,1):
                line = line.strip()
                if not line:
                    continue
                try:
                    ev = json.loads(line)
                except json.JSONDecodeError:
                    continue
                ev["_uid"] = f"{tag}:{lineno}"
                events.append(ev)
    return events

def replay(events, rules_path, run="latest"):
    run_ids = sorted({e.get("run_id") for e in events if e.get("run_id")})
    if run == "latest" and run_ids:
        events = [e for e in events if e.get("run_id") == run_ids[-1]]
        print(f"Replaying latest run only: {run_ids[-1]} ({len(run_ids)} runs found, use --run all for all)")
    elif run not in ("latest", "all"):
        events = [e for e in events if e.get("run_id") == run]
    events.sort(key=lambda e: (e.get("run_id") or "", e.get("timestamp") or ""))
 
    engine = RuleEngine(rules_path)
    alerts, current_run = [], None
    for ev in events:
        if ev.get("run_id") != current_run:
            engine.reset()                      
            current_run = ev.get("run_id")
        alerts += engine.process_event(ev)
    return events, alerts
 
 
def summarize(events, alerts, show):
    print(f"\nEvents replayed: {len(events)}   Alerts: {len(alerts)}")
    if not alerts:
        return
    by_rule = Counter((a["severity"], a["rule_id"]) for a in alerts)
    print("\nAlerts by rule:")
    for (sev, rule_id), n in sorted(by_rule.items(), key=lambda x: (-SEVERITY_ORDER[x[0][0]], -x[1])):
        print(f"  {sev:<7} {rule_id:<32} {n}")
    print(f"\nFirst {min(show, len(alerts))} alerts:")
    for a in alerts[:show]:
        img = (a["image"] or "").split("\\")[-1]
        brief = json.dumps(a["details"], default=str)[:150]
        print(f"  [{a['severity']:<6}] {a['timestamp'][11:19]} {a['rule_id']} pid={a['pid']} {img} {brief}")

def main():
    # adding below lines for command line ease, will need to see about it during actual integration
    ap = argparse.ArgumentParser(description="Replay ETW collector output through the rule engine")
    ap.add_argument("folder", nargs="?", default=".")
    ap.add_argument("--rules", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "rules.json"))
    ap.add_argument("--run", default="latest", help="latest (default), all, or a specific run_id")
    ap.add_argument("--out", default="alerts.jsonl")
    ap.add_argument("--show", type=int, default=25)
    args = ap.parse_args()
    events = load_events(args.folder)
    events,alerts = replay(events, args.rules, args.run)
    with open(args.out, "w", encoding="utf-8") as f:
        for a in alerts:
            f.write(json.dumps(a)+"\n")
    summarize(events, alerts, args.show)
    print(f"\nAlerts written to {args.out}")


if __name__ == "__main__":
    main()
