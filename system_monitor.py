import psutil
import json
import platform
from datetime import datetime

uptime = datetime.now().timestamp() - psutil.boot_time()

data = {
    "timestamp": datetime.now().isoformat(),
    "hostname": platform.node(),
    "os": platform.system(),
    "cpu_percent": psutil.cpu_percent(),
    "cpu_cores": psutil.cpu_count(logical=False),
    "cpu_threads": psutil.cpu_count(logical=True),
    "memory_percent": psutil.virtual_memory().percent,
    "memory_total": psutil.virtual_memory().total,
    "memory_available": psutil.virtual_memory().available,
    "boot_time": psutil.boot_time(),
    "uptime_seconds": uptime,
    "processes": [],
    "disks": [],
    "network": [],
    "connections": []
}

for process in psutil.process_iter(["pid", "name", "username", "cpu_percent", "memory_percent"]):
    data["processes"].append(process.info)

for partition in psutil.disk_partitions():
    try:
        usage = psutil.disk_usage(partition.mountpoint)

        data["disks"].append({
            "device": partition.device,
            "mountpoint": partition.mountpoint,
            "filesystem": partition.fstype,
            "total": usage.total,
            "used": usage.used,
            "free": usage.free,
            "percent": usage.percent
        })

    except PermissionError:
        pass
for interface, addresses in psutil.net_if_addrs().items():
    for address in addresses:
        data["network"].append({
            "interface": interface,
            "address": address.address,
            "netmask": address.netmask,
            "broadcast": address.broadcast
        })
for connection in psutil.net_connections():
    local_ip = None
    local_port = None
    remote_ip = None
    remote_port = None

    if connection.laddr:
        local_ip = connection.laddr.ip
        local_port = connection.laddr.port

    if connection.raddr:
        remote_ip = connection.raddr.ip
        remote_port = connection.raddr.port

    data["connections"].append({
        "pid": connection.pid,
        "status": connection.status,
        "local_ip": local_ip,
        "local_port": local_port,
        "remote_ip": remote_ip,
        "remote_port": remote_port
    })

with open("system_data.json", "w") as file:
    json.dump(data, file, indent=4)

print("System data saved to system_data.json")