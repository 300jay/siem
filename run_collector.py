import subprocess

print("Collecting system data...")
subprocess.run(["python", "system_monitor.py"])

print("Collecting network data...")
subprocess.run(["python", "network_monitor.py"])

print("Combining all data...")
subprocess.run(["python", "combine_data.py"])

print("Collection complete!")