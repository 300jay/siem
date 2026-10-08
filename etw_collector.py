import json
import os
import time
from datetime import datetime, timezone
import threading

import win32file

# etw imports
from etw import ETW, ProviderInfo
from etw.GUID import GUID


from enrichment import enrich_with_psutil, snapshot_running_processes

DEBUG_RAW = False
PRINT_NETWORK = False
RUN_ID = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

PROCESS_PROVIDER = "{22FB2CD6-0E7B-422B-A0C7-2FAD1FD0E716}"
NETWORK_PROVIDER = "{7DD42A49-5329-4832-8DFD-43D979153A88}"
DNS_PROVIDER = "{1C95126E-7EEA-49A9-A3FE-A378B03DDB4D}"
LOST_EVENT_PROVIDER = "{6A399AE0-4BC6-4DE9-870B-3657F8947E7E}"

PROCESS_OUT = "etw_process_events.json"
NETWORK_OUT = "etw_network_events.json"
DNS_OUT = "etw_dns_events.json"

PROCESS_START_IDS = {1}      # event id for a start of process
PROCESS_END_IDS = {2}        # event id for end of a process
NETWORK_EVENT_IDS = {10, 11, 12, 13, 42, 43}  # send, receive, connect and disconnect event ids, then TCP UDP as well
DNS_QUERY_COMPLETE_IDS = {3008}  # dns query completed
DNS_QUERY_START_IDS = {3006}     # dns query started

KNOWN_NOISE_IDS = {(PROCESS_PROVIDER, i) for i in (3, 4, 5, 6, 7, 8, 9, 10, 21)}
KNOWN_NOISE_IDS |= {(DNS_PROVIDER, i) for i in (1001, 1016, 3009, 3010, 3011, 3016, 3018, 3019, 3020)}
INFO_OUT="etw_info_events.jsonl"
_device_map_cache = None
_write_lock = threading.Lock()
known_processes = {}

def classify_and_log(parsed, provider_id, eid, task_name):
    if (provider_id,eid) in KNOWN_NOISE_IDS:
        return
    lost = provider_id == LOST_EVENT_PROVIDER
    info_event = {
        "timestamp": now_iso(),
        "host": os.environ.get("COMPUTERNAME"),
        "source": "etw",
        "provider_id": provider_id,
        "event_id": eid,
        "task_name": task_name,
        "severity": "warning" if lost else "info",
        "raw": parsed,
    }
    write_event(INFO_OUT, info_event)
    if lost:
        print("[WARN] ETW reported LOST events - the agent fell behind and events were dropped")
    else:
        print(f"[info] provider={provider_id} event_id={eid} task={task_name}")
def _build_device_map():
    mapping={}
    for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        drive = f"{letter}:"
        try:
            targets = win32file.QueryDosDevice(drive)
            for target in targets.split("\x00"):
                if target:
                    mapping[target] = drive
        except Exception:
            continue
    return mapping

def emit_process_snapshot():
    count=0
    try:
        for proc in snapshot_running_processes():
            event = {
                "timestamp": now_iso(),
                "host": os.environ.get("COMPUTERNAME"),
                "source": "snapshot",
                "provider": "psutil",
                "event_id": None,
                "event_type": "process_snapshot",
                **proc,
            }
            write_event(PROCESS_OUT, event)
            known_processes[proc["pid"]] = proc["image"]
            count+=1
            if count % 50 ==0:
                print(f"[snapshot] {count} processes so far...")
    except Exception as e:
        print(f"[snapshot] stopped early after {count} processes: {e!r}")
        return
    print(f"[snapshot] wrote {count} already-running processes")


def resolve_device_path(path: str) -> str:
    global _device_map_cache
    if not path:
        return path
    if _device_map_cache is None:
        _device_map_cache = _build_device_map()
    for device_prefix, drive in _device_map_cache.items():
        if path.startswith(device_prefix):
            return drive + path[len(device_prefix):]
    return path

# Shared helpers

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def write_event(path, event: dict):
    event["run_id"] = RUN_ID
    line = json.dumps(event) +"\n"
    with _write_lock:   
        with open(path, "a", encoding="utf-8") as f:
            f.write(line)

def get_event_id(parsed: dict):
    header = parsed.get("EventHeader", {})
    descriptor = header.get("EventDescriptor", {})
    eid = descriptor.get("Id")
    if eid is not None:
        try:
            return int(eid)
        except (TypeError, ValueError):
            pass
    return None

def get_field(parsed: dict, *candidates, default=None):
    for c in candidates:
        if c in parsed:
            return parsed[c]
    return default

def process_callback(event_tuple):
    event_id_raw, parsed = event_tuple
    if DEBUG_RAW:
        print("[RAW process]", parsed)
    eid= get_event_id(parsed)
    if eid not in PROCESS_START_IDS | PROCESS_END_IDS:
        return

    pid = get_field(parsed, "ProcessID", "ProcessId")
    parent_pid = get_field(parsed, "ParentProcessID", "ParentProcessId")
    image_raw = get_field(parsed, "ImageName","ImageFileName")
    image = resolve_device_path(image_raw) if image_raw else None

    enrichment = {"command_line": None, "username": None, "parent_image": None}
    if eid in PROCESS_START_IDS and pid is not None:
        enrichment=enrich_with_psutil(pid, image)
        known_processes[pid] = image
    elif eid in PROCESS_END_IDS:
        image = known_processes.pop(pid, None) or image
    event ={
        "timestamp": now_iso(),
        "host": os.environ.get("COMPUTERNAME"),
        "source": "etw_proc",
        "provider": "Kernel-Process",
        "event_id": eid,
        "event_type": "process_start" if eid in PROCESS_START_IDS else "process_end",
        "pid": pid,
        "parent_pid": parent_pid,
        "parent_image": os.path.basename(known_processes.get(parent_pid) or "") or enrichment["parent_image"],
        "image": image,
        "command_line": enrichment["command_line"],
        "user": enrichment["username"],
        "user_sid": get_field(parsed, "UserSID"),
        "exit_code": get_field(parsed, "ExitStatus"),
        "raw": parsed if DEBUG_RAW else None,
    }
    write_event(PROCESS_OUT, event)
    print(f"[process] pid={event['pid']} image={event['image']} "
          f"parent={event['parent_image']} cmd={event['command_line']}")

def network_callback(event_tuple):
    event_id_raw, parsed = event_tuple
    if DEBUG_RAW:
        print("[RAW network]", parsed)
    eid= get_event_id(parsed)
    if eid not in NETWORK_EVENT_IDS:
        return

    proto = "udp" if eid in (42, 43) else "tcp"
    event ={
        "timestamp": now_iso(),
        "host": os.environ.get("COMPUTERNAME"),
        "source": "etw_net",
        "provider": "Kernel-Network",
        "event_id": eid,
        "event_type": "network",
        "pid": get_field(parsed, "PID", "ProcessId"),
        "protocol": proto,
        "src_ip": get_field(parsed, "saddr","SourceAddress"),
        "src_port": get_field(parsed,"sport","SourcePort"),
        "dst_ip": get_field(parsed, "daddr", "DestinationAddress"),
        "dst_port": get_field(parsed, "dport", "DestinationPort"),
        "size": get_field(parsed, "size", "Size"),
        "raw": parsed if DEBUG_RAW else None,
    }
    write_event(NETWORK_OUT, event)
    if PRINT_NETWORK:
        print(f"[network] pid={event['pid']} {event['src_ip']}:{event['src_port']} -> "
              f"{event['dst_ip']}:{event['dst_port']} ({event['size']}B)")
def dns_callback(event_tuple):
    event_id_raw, parsed = event_tuple
    if DEBUG_RAW:
        print("[RAW dns]", parsed)
    dns_pid = get_field(parsed, "PID", "ProcessID") or parsed.get("EventHeader", {}).get("ProcessId")
    eid = get_event_id(parsed)
    if eid not in DNS_QUERY_COMPLETE_IDS | DNS_QUERY_START_IDS:
        return
 
    event = {
        "timestamp": now_iso(),
        "host": os.environ.get("COMPUTERNAME"),
        "source": "etw",
        "provider": "DNS-Client",
        "event_id": eid,
        "event_type": "dns",
        "pid": str(dns_pid) if dns_pid is not None else None,
        "dns_query": get_field(parsed, "QueryName"),
        "query_type": get_field(parsed, "QueryType"),
        "dns_result": get_field(parsed, "QueryResults") if eid in DNS_QUERY_COMPLETE_IDS else None,
        "query_status": get_field(parsed, "QueryStatus"),
        "raw": parsed if DEBUG_RAW else None,
    }
    write_event(DNS_OUT, event)
    print(f"[dns] pid={event['pid']} query={event['dns_query']} result={event['dns_result']}")
 
# main
def get_provider_id(parsed: dict):
    return parsed.get("EventHeader", {}).get("ProviderId")

def run():
    providers=[ProviderInfo("Microsoft-Windows-Kernel-Process", GUID(PROCESS_PROVIDER)),
        ProviderInfo("Microsoft-Windows-Kernel-Network", GUID(NETWORK_PROVIDER)),
        ProviderInfo("Microsoft-Windows-DNS-Client", GUID(DNS_PROVIDER)),]
    def dispatch(event_tuple):
        event_id_raw, parsed = event_tuple
        provider_id = get_provider_id(parsed)
        eid = get_event_id(parsed)
        task_name = parsed.get("Task Name")  # present in your raw output

        if provider_id == PROCESS_PROVIDER and eid in PROCESS_START_IDS | PROCESS_END_IDS:
            process_callback(event_tuple)
        elif provider_id == NETWORK_PROVIDER and eid in NETWORK_EVENT_IDS:
            network_callback(event_tuple)
        elif provider_id == DNS_PROVIDER and eid in DNS_QUERY_COMPLETE_IDS | DNS_QUERY_START_IDS:
            dns_callback(event_tuple)
        else:
            classify_and_log(parsed, provider_id, eid, task_name)
    etw = ETW(
            session_name="siem_etw_agent",
            providers=providers,
            event_callback=dispatch,
        )

    print("Starting ETW session 'siem etw agent' on 3 provides...")
    print(f"Writing: {PROCESS_OUT},{NETWORK_OUT},{DNS_OUT}")
    if DEBUG_RAW:
        print("DEBUG_RAW is true")
    etw.start()
    threading.Thread(target=emit_process_snapshot, daemon=True, name="snapshot").start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        etw.stop()

if __name__ == "__main__":
    run()