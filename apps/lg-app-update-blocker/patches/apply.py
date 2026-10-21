#!/usr/bin/env python3
import json
import shutil
import sys
from pathlib import Path

if len(sys.argv) != 4:
    raise SystemExit("usage: apply.py <upstream-source> <patch-directory> <app-metadata>")

source = Path(sys.argv[1]).resolve()
patches = Path(sys.argv[2]).resolve()
metadata_path = Path(sys.argv[3]).resolve()
metadata = json.loads(metadata_path.read_text())
version = metadata["version"]

shutil.copy2(patches / "remote-navigation.js", source / "frontend" / "remote-navigation.js")
shutil.copy2(patches / "remote-focus.css", source / "frontend" / "remote-focus.css")
shutil.copy2(patches / "firmware-cache-ui.js", source / "frontend" / "firmware-cache-ui.js")
shutil.copy2(patches / "app-dependency-ui.js", source / "frontend" / "app-dependency-ui.js")
shutil.copy2(patches / "app-launch-ui.js", source / "frontend" / "app-launch-ui.js")

html = source / "frontend" / "index.html"
text = html.read_text()

style_marker = "    </style>\n</head>"
style_insert = "    </style>\n    <link rel=\"stylesheet\" href=\"remote-focus.css\">\n</head>"
if style_marker not in text:
    raise SystemExit("index.html style insertion point not found")
text = text.replace(style_marker, style_insert, 1)

ssh_card_marker = """    <div class="card" style="margin: 0 0 20px 0;">
        <div class="section">
            <h2>SSH Key Management</h2>"""
firmware_card = """    <div class="card" style="margin: 0 0 20px 0;">
        <div class="section">
            <h2>System Firmware Update Cache</h2>
            <p>Inspect and clear cached system-update state without using SSH.</p>
            <div id="firmwareCacheStatus" style="margin: 15px 0; font-weight: bold;">Waiting for root service...</div>
            <button id="refreshFirmwareCache" disabled>Refresh Firmware Cache</button>
            <button id="clearFirmwareCache" disabled>Delete Firmware Update Cache</button>
            <div id="firmwareCacheContent" class="update-info" style="margin: 15px 0;">Waiting...</div>
            <p style="color: var(--text-secondary); font-size: 14px;">
                Cleanup is limited to files and symlinks directly inside
                <code>/mnt/lg/cmn_data/swupdate/</code>. Directories are never removed.
            </p>
        </div>
    </div>

"""
if ssh_card_marker not in text:
    raise SystemExit("index.html SSH card insertion point not found")
dependency_card = """    <div class="card" style="margin: 0 0 20px 0;">
        <div class="section">
            <h2>App Update Dependency Cache</h2>
            <p>Inspect and clear the secondary app-update dependency state separately from the standard forced-update list.</p>
            <div id="updateDependencyStatus" style="margin: 15px 0; font-weight: bold;">Waiting for root service...</div>
            <button id="refreshUpdateDependencyInfo" disabled>Refresh Dependency Status</button>
            <button id="clearUpdateDependencyInfo" disabled>Clear Dependency Update Info</button>
            <div id="updateDependencyContent" class="update-info" style="margin: 15px 0;">Waiting...</div>
            <p style="color: var(--text-secondary); font-size: 14px;">
                This controls only <code>com.webos.appInstallService/updateDependencyInfo</code>.
                The original blocked-apps list is not modified by this button.
            </p>
        </div>
    </div>

"""
launch_diagnostic_card = """    <div class="card" style="margin: 0 0 20px 0;">
        <div class="section">
            <h2>Live App Launch Diagnostic</h2>
            <p>Check an installed app against the known update lists and test launching it without a launch-time update check.
               This does not install an update or modify any application.</p>
            <div id="launchInventoryStatus" style="margin: 15px 0; font-weight: bold;">Waiting for root service...</div>
            <button id="refreshLaunchApps" disabled>Load Installed Apps</button>
            <button id="previousLaunchPage" disabled>Previous Page</button>
            <button id="nextLaunchPage" disabled>Next Page</button>
            <div id="launchAppList" class="update-info" style="margin: 15px 0;">Waiting...</div>
            <div id="selectedLaunchApp" style="margin: 15px 0;">Select an installed app above.</div>
            <button id="inspectLaunchApp" disabled>Inspect Update Gate</button>
            <button id="launchWithoutUpdateCheck" disabled>Launch Without Update Check</button>
            <h3>Use the Original Home Screen Icon</h3>
            <p>Apply the same no-update-check policy to the installed app. The original icon stays where it is. One full TV restart is required.</p>
            <div id="homeLaunchPolicyStatus" style="margin: 15px 0;">Select an app to check its Home icon launch setting.</div>
            <button id="enableHomeLaunchOverride" disabled>Fix Original Home Icon</button>
            <button id="restoreHomeLaunchOverride" disabled>Restore Original Launch Setting</button>
            <div id="launchDiagnosticResult" class="update-info" style="margin: 15px 0;">No app inspected yet.</div>
            <h3>Last launch test</h3>
            <div id="launchDiagnosticHistory" class="update-info" style="margin: 15px 0;">No launch test attempted.</div>
            <p style="color: var(--text-secondary); font-size: 14px;">
                The test sends <code>checkUpdateOnLaunch:false</code> to the webOS application manager.
                A successful request does not guarantee the app opened or bypassed a prompt.
                If the original app itself requires an update, this cannot override it.
            </p>
        </div>
    </div>

"""
text = text.replace(ssh_card_marker, launch_diagnostic_card + dependency_card + firmware_card + ssh_card_marker, 1)

script_marker = '    <script src="index.js"></script>'
script_insert = (
    script_marker
    + '\n    <script src="firmware-cache-ui.js"></script>'
    + '\n    <script src="app-dependency-ui.js"></script>'
    + '\n    <script src="app-launch-ui.js"></script>'
    + '\n    <script src="remote-navigation.js"></script>'
)
if script_marker not in text:
    raise SystemExit("index.html script insertion point not found")
html.write_text(text.replace(script_marker, script_insert, 1))

service = source / "service" / "service.js"
service_text = service.read_text()
persistence_start = "var autostartScript ="
persistence_end = "const SSH_KEYS_PATH = '/home/root/.ssh/authorized_keys';"
if service_text.count(persistence_start) != 1 or service_text.count(persistence_end) != 1:
    raise SystemExit("service.js persistence patch anchors no longer match pinned upstream")
start = service_text.index(persistence_start)
end = service_text.index(persistence_end)
replacement = (
    (patches / "service-persistence.js").read_text().rstrip()
    + "\n\n"
    + (patches / "firmware-cache-service.js").read_text().rstrip()
    + "\n\n"
    + (patches / "app-dependency-service.js").read_text().rstrip()
    + "\n\n"
    + (patches / "home-launch-service.js").read_text().rstrip()
    + "\n\n"
)
service.write_text(service_text[:start] + replacement + service_text[end:])

webpack = source / "webpack.config.js"
text = webpack.read_text()
copy_marker = "          { context: 'frontend', from: 'index.html' },"
copy_insert = (
    "          { context: 'frontend', from: '*.html' },\n"
    "          { context: 'frontend', from: '*.css' },\n"
    "          { context: 'frontend', from: 'firmware-cache-ui.js' },\n"
    "          { context: 'frontend', from: 'app-dependency-ui.js' },\n"
    "          { context: 'frontend', from: 'app-launch-ui.js' },\n"
    "          { context: 'frontend', from: 'remote-navigation.js' },"
)
if copy_marker not in text:
    raise SystemExit("webpack frontend copy rule not found")
text = text.replace(copy_marker, copy_insert, 1)
text = text.replace("        });``", "        });")
webpack.write_text(text)


# The public application-manager launch/status methods require these webOS TV ACGs.
# The private app inventory is read separately via the already-rooted Homebrew service.
appinfo = source / "appinfo.json"
appinfo_data = json.loads(appinfo.read_text())
acgs = appinfo_data.get("requiredACG", [])
if not isinstance(acgs, list):
    raise SystemExit("unexpected requiredACG type in upstream appinfo.json")
for acg in ("application.launcher", "application.query"):
    if acg not in acgs:
        acgs.append(acg)
appinfo_data["requiredACG"] = acgs
appinfo.write_text(json.dumps(appinfo_data, indent=2) + "\n")

package = source / "package.json"
data = json.loads(package.read_text())
data["version"] = version
package.write_text(json.dumps(data, indent=2) + "\n")
