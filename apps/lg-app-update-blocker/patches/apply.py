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

html = source / "frontend" / "index.html"
text = html.read_text()
style_marker = "    </style>\n</head>"
style_insert = "    </style>\n    <link rel=\"stylesheet\" href=\"remote-focus.css\">\n</head>"
if style_marker not in text:
    raise SystemExit("index.html style insertion point not found")
text = text.replace(style_marker, style_insert, 1)
script_marker = '    <script src="index.js"></script>'
script_insert = script_marker + '\n    <script src="remote-navigation.js"></script>'
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
replacement = (patches / "service-persistence.js").read_text().rstrip() + "\n\n"
service.write_text(service_text[:start] + replacement + service_text[end:])

webpack = source / "webpack.config.js"
text = webpack.read_text()
copy_marker = "          { context: 'frontend', from: 'index.html' },"
copy_insert = "          { context: 'frontend', from: '*.html' },\n          { context: 'frontend', from: '*.css' },\n          { context: 'frontend', from: 'remote-navigation.js' },"
if copy_marker not in text:
    raise SystemExit("webpack frontend copy rule not found")
text = text.replace(copy_marker, copy_insert, 1)
text = text.replace("        });``", "        });")
webpack.write_text(text)

package = source / "package.json"
data = json.loads(package.read_text())
data["version"] = version
package.write_text(json.dumps(data, indent=2) + "\n")
