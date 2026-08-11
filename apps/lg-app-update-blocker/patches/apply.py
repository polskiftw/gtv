#!/usr/bin/env python3
import json
import shutil
import sys
from pathlib import Path

if len(sys.argv) != 3:
    raise SystemExit("usage: apply.py <upstream-source> <patch-directory>")

source = Path(sys.argv[1]).resolve()
patches = Path(sys.argv[2]).resolve()

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
data["version"] = "1.0.1"
package.write_text(json.dumps(data, indent=2) + "\n")
