from datetime import datetime, timezone
import psutil
import os

def enrich_with_psutil(pid, expected_image=None):
    result = {"command_line": None, "username": None, "parent_image": None}

    try:
        p=psutil.Process(int(pid))
    except (psutil.NoSuchProcess, psutil.AccessDenied, ValueError, TypeError):
        return result

    # PID reuse guard: if the live process isn't the one ETW reported, return nothing
    if expected_image:
        try:
            live_exe = p.exe()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            live_exe = None
        if live_exe and os.path.basename(live_exe).lower() != os.path.basename(expected_image).lower():
            return result
    try:
        result["command_line"] =" ".join(p.cmdline()) or None
    except(psutil.NoSuchProcess, psutil.AccessDenied):
        pass

    try:
        result["username"]= p.username()
    except(psutil.NoSuchProcess, psutil.AccessDenied):
            pass

    try:
        parent = p.parent()
        if parent is not None:
             result["parent_image"] = parent.name()
    except(psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    
    return result

def snapshot_running_processes():
    # get a snapshot of the processes already started before the startup of the siem
    attrs = ["pid","ppid","name","exe","cmdline","username","create_time"]
    procs=list(psutil.process_iter(attrs))
    names = {p.info["pid"]: p.info["name"] for p in procs}

    snapshot =[]
    for p in procs:
        info = p.info
        created = info.get("create_time")
        snapshot.append({
            "pid":str(info["pid"]),
            "parent_pid": str(info["ppid"]),
            "parent_image": names.get(info["ppid"]),
            "image":info.get("exe"),
            "command_line": " ".join(info["cmdline"]) if info.get("cmdline") else None,
            "user": info.get("username"),
            "process_created": (
                datetime.fromtimestamp(created, timezone.utc).isoformat()
                if created else None
            ),
        })
    return snapshot
