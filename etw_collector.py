import json
import os
import time
from datetime import datetime, timezone

import win32file

# etw imports
from etw import ETW, ProviderInfo
from etw.GUID import GUID

DEBUG_RAW = True

PROCESS_PROVIDER = "{22FB2CD6-0E7B-422B-A0C7-2FAD1FD0E716}"
NETWORK_PROVIDER = "{7DD42A49-5329-4832-8DFD-43D979153A88}"
DNS_PROVIDER = "{1C95126E-7EEA-49A9-A3FE-A378B03DDB4D}"

PROCESS_OUT = "etw_process_events.json"
NETWORK_OUT = "etw_network_events.json"
DNS_OUT = "etw_dns_events.json"

PROCESS_START_IDS = {1}      # event id for a start of process
PROCESS_END_IDS = {2}        # event id for end of a process
NETWORK_EVENT_IDS = {10, 11, 12, 13, 42, 43}  # send, receive, connect and disconnect event ids, then TCP UDP as well
DNS_QUERY_COMPLETE_IDS = {3008}  # dns query completed
DNS_QUERY_START_IDS = {3006}     # dns query started

KNOWN_NOISE_IDS={7,8,21}
INFO_OUT="etw_info_events.jsonl"
_device_map_cache = None

def classify_and_log(parsed, provider_id, eid, task_name):
    if eid in KNOWN_NOISE_IDS:
        return
    info_event = {
        "timestamp": now_iso(),
        "host": os.environ.get("COMPUTERNAME"),
        "source": "etw",
        "provider_id": provider_id,
        "event_id": eid,
        "task_name": task_name,
        "severity": "info",
        "raw": parsed,
    }
    write_event(INFO_OUT, info_event)
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
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(event)+"\n")

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

    image_raw = get_field(parsed, "ImageName","ImageFileName")
    event ={
        "timestamp": now_iso(),
        "host": os.environ.get("COMPUTERNAME"),
        "source": "etw_proc",
        "provider": "Kernel-Process",
        "event_id": eid,
        "event_type": "process_start" if eid in PROCESS_START_IDS else "process_end",
        "pid": get_field(parsed, "ProcessID", "ProcessId"),
        "parent_pid": get_field(parsed, "ParentProcessID", "ParentProcessId"),
        "image": resolve_device_path(image_raw) if image_raw else None,
        "command_line": get_field(parsed, "CommandLine") or None,  # expected empty -- see module docstring
        "user_sid": get_field(parsed, "UserSID"),
        "exit_code": get_field(parsed, "ExitStatus"),
        "raw": parsed if DEBUG_RAW else None,
    }
    write_event(PROCESS_OUT, event)
    print(f"[process] pid={event['pid']} image={event['image']}")

def process_callback(event_tuple):
    event_id_raw, parsed = event_tuple
    if DEBUG_RAW:
        print("[RAW process]", parsed)
    eid= get_event_id(parsed)
    if eid not in PROCESS_START_IDS | PROCESS_END_IDS:
        return

    image_raw = get_field(parsed, "ImageName","ImageFileName")
    event ={
        "timestamp": now_iso(),
        "host": os.environ.get("COMPUTERNAME"),
        "source": "etw_proc",
        "provider": "Kernel-Process",
        "event_id": eid,
        "event_type": "process_start" if eid in PROCESS_START_IDS else "process_end",
        "pid": get_field(parsed, "ProcessID", "ProcessId"),
        "parent_pid": get_field(parsed, "ParentProcessID", "ParentProcessId"),
        "image": resolve_device_path(image_raw) if image_raw else None,
        "command_line": get_field(parsed, "CommandLine") or None,  # expected empty -- see module docstring
        "user_sid": get_field(parsed, "UserSID"),
        "exit_code": get_field(parsed, "ExitStatus"),
        "raw": parsed if DEBUG_RAW else None,
    }
    write_event(PROCESS_OUT, event)
    print(f"[process] pid={event['pid']} image={event['image']}")

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
    print(f"[network] pid={event['pid']} {event['src_ip']}:{event['src_port']} -> "
          f"{event['dst_ip']}:{event['dst_port']} ({event['size']}B)")

def dns_callback(event_tuple):
    event_id_raw, parsed = event_tuple
    if DEBUG_RAW:
        print("[RAW dns]", parsed)
 
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
        "pid": get_field(parsed, "PID", "ProcessID"),
        "dns_query": get_field(parsed, "QueryName"),
        "query_type": get_field(parsed, "QueryType"),
        "dns_result": get_field(parsed, "QueryResults") if eid in DNS_QUERY_COMPLETE_IDS else None,
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
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        etw.stop()

if __name__ == "__main__":
    run()