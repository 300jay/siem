import subprocess

command = [
    r"D:\Installed\WireShark\tshark.exe",
    "-i", "4",
    "-c", "10",
    "-T", "json"
]

with open("network_data.json", "w") as file:
    subprocess.run(command, stdout=file)

print("Network data saved to network_data.json")