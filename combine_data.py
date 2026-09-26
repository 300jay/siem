import json
import requests

with open("system_data.json", "r") as file:
    system_data = json.load(file)

with open("network_data.json", "r") as file:
    network_data = json.load(file)

response = requests.get("http://localhost:3000/logs/windows")
windows_data = response.json()

data = {
    "system": system_data,
    "network": network_data,
    "windows_logs": windows_data
}

with open("combined_data.json", "w") as file:
    json.dump(data, file, indent=4)

print("All data saved to combined_data.json")