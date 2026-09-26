const express = require("express");
const { exec } = require("child_process");

const app = express();

function parseSecurityEvent(log) {

    const message = log.Message || "";

    const result = {
        timestamp: null,
        event_id: log.Id,
        level: log.LevelDisplayName,
        provider: log.ProviderName,
        event_type: null,
        account_name: null,
        logon_type: null,
        process_name: null,
        authentication_package: null
    };

    const milliseconds = Number(
        log.TimeCreated.replace("/Date(", "").replace(")/", "")
    );

    result.timestamp = new Date(milliseconds).toISOString();

    if (log.Id === 4624) {

        result.event_type = "successful_logon";

        const accountMatch = message.match(
            /New Logon:[\s\S]*?Account Name:\s*(.+)/
        );

        if (accountMatch) {
            result.account_name = accountMatch[1].trim();
        }

        const logonTypeMatch = message.match(
            /Logon Type:\s*(\d+)/
        );

        if (logonTypeMatch) {
            result.logon_type = Number(logonTypeMatch[1]);
        }

        const processMatch = message.match(
            /Process Name:\s*(.+)/
        );

        if (processMatch) {
            result.process_name = processMatch[1].trim();
        }

        const authMatch = message.match(
            /Authentication Package:\s*(.+)/
        );

        if (authMatch) {
            result.authentication_package = authMatch[1].trim();
        }
    }

    if (log.Id === 4798) {

        result.event_type = "user_group_membership_enumerated";

        const accountMatch = message.match(
            /User:\s*[\s\S]*?Account Name:\s*(.+)/
        );

        if (accountMatch) {
            result.account_name = accountMatch[1].trim();
        }

        const processMatch = message.match(
            /Process Name:\s*(.+)/
        );

        if (processMatch) {
            result.process_name = processMatch[1].trim();
        }
    }

    return result;
}

app.get("/logs/windows/security/4624", (req, res) => {

    const command = `Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624} -MaxEvents 5 | Select-Object TimeCreated, Id, LevelDisplayName, ProviderName, Message | ConvertTo-Json`;

    exec(`powershell -Command "${command}"`, (error, stdout, stderr) => {

        if (error) {
            return res.status(500).json({
                error: error.message
            });
        }

        if (stderr) {
            return res.status(500).json({
                error: stderr
            });
        }

        try {

            let logs = JSON.parse(stdout);

            if (!Array.isArray(logs)) {
                logs = [logs];
            }

            const formattedLogs = logs.map(log => {
                return parseSecurityEvent(log);
            });

            res.json(formattedLogs);

        } catch (parseError) {

            res.status(500).json({
                error: "Could not parse Windows 4624 logs"
            });

        }
    });
});

app.get("/logs/windows/security", (req, res) => {

    const command = `Get-WinEvent -LogName Security -MaxEvents 5 | Select-Object TimeCreated, Id, LevelDisplayName, ProviderName, Message | ConvertTo-Json`;

    exec(`powershell -Command "${command}"`, (error, stdout, stderr) => {

        if (error) {
            return res.status(500).json({
                error: error.message
            });
        }

        if (stderr) {
            return res.status(500).json({
                error: stderr
            });
        }

        try {

            let logs = JSON.parse(stdout);

            if (!Array.isArray(logs)) {
                logs = [logs];
            }

            const formattedLogs = logs.map(log => {
                return parseSecurityEvent(log);
            });

            res.json(formattedLogs);

        } catch (parseError) {

            res.status(500).json({
                error: "Could not parse Windows Security logs"
            });
        }
    });
});
app.get("/logs/windows", (req, res) => {

    const command = `Get-WinEvent -LogName System -MaxEvents 10 | Select-Object TimeCreated, Id, LevelDisplayName, ProviderName, Message | ConvertTo-Json`;

    exec(`powershell -Command "${command}"`, (error, stdout, stderr) => {

        if (error) {
            return res.status(500).json({
                error: error.message
            });
        }

        if (stderr) {
            return res.status(500).json({
                error: stderr
            });
        }

        try {
            let logs = JSON.parse(stdout);

            if (!Array.isArray(logs)) {
                logs = [logs];
            }

            res.json(logs);

        } catch (parseError) {
            res.status(500).json({
                error: "Could not parse Windows logs"
            });
        }
    });
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});