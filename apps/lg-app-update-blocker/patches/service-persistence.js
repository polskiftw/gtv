const HOSTS_FILE_PATH = '/etc/hosts';
const UPDATE_DOMAINS_FILE = path.join(__dirname, 'lg_update_domains.txt');
const PERSISTENT_SCRIPT_PATH = '/var/lib/webosbrew/init.d/appupdateblocker';
const PERSISTENT_DATA_DIR = '/var/lib/webosbrew/appupdateblocker';
const PERSISTENT_DOMAINS_PATH = path.join(PERSISTENT_DATA_DIR, 'lg_update_domains.txt');
const PERSISTENCE_MARKER = '# GTV APPUPDATEBLOCKER PERSISTENCE v2';
const HOSTS_HEADER = '# LG App Update Blocker - Update domains';
const HOSTS_END_MARKER = '# END LG App Update Blocker - Update domains';

var autostartScript =
`#!/bin/sh
# GTV APPUPDATEBLOCKER PERSISTENCE v2
# Homebrew Channel regenerates /etc/hosts before running /var/lib/webosbrew/init.d.
# Reapply the packaged LG domain list directly here; do not depend on Luna services.

HOSTS_FILE='/etc/hosts'
DOMAINS_FILE='/var/lib/webosbrew/appupdateblocker/lg_update_domains.txt'
HEADER='# LG App Update Blocker - Update domains'
END_MARKER='# END LG App Update Blocker - Update domains'

[ -r "$DOMAINS_FILE" ] || exit 0
[ -w "$HOSTS_FILE" ] || exit 0

# A complete block means this boot has already been reconciled.
if grep -Fq "$END_MARKER" "$HOSTS_FILE"; then
    exit 0
fi

printf '\n%s\n' "$HEADER" >> "$HOSTS_FILE"
while IFS= read -r domain || [ -n "$domain" ]; do
    domain=$(printf '%s' "$domain" | tr -d '\r')
    [ -n "$domain" ] || continue
    case "$domain" in
        \#*) continue ;;
    esac
    printf '0.0.0.0 %s\n' "$domain" >> "$HOSTS_FILE"
done < "$DOMAINS_FILE"
printf '%s\n' "$END_MARKER" >> "$HOSTS_FILE"

exit 0
`;

function readUpdateDomains() {
    return fs.readFileSync(UPDATE_DOMAINS_FILE, 'utf8')
        .split('\n')
        .map(function(domain) { return domain.trim(); })
        .filter(function(domain) { return domain && domain.charAt(0) !== '#'; });
}

function hostLineContainsDomain(line, domain) {
    var withoutComment = line.split('#', 1)[0].trim();
    if (!withoutComment) return false;
    return withoutComment.split(/\s+/).indexOf(domain) !== -1;
}

function hostsContainsDomain(hostsContent, domain) {
    return hostsContent.split('\n').some(function(line) {
        return hostLineContainsDomain(line, domain);
    });
}

function addDomainsToHosts() {
    var updateDomains = readUpdateDomains();
    var hostsContent = fs.readFileSync(HOSTS_FILE_PATH, 'utf8');
    var missingDomains = updateDomains.filter(function(domain) {
        return !hostsContainsDomain(hostsContent, domain);
    });

    if (missingDomains.length === 0) {
        return 0;
    }

    if (hostsContent && !hostsContent.endsWith('\n')) {
        hostsContent += '\n';
    }
    if (hostsContent.indexOf(HOSTS_HEADER) === -1) {
        hostsContent += '\n' + HOSTS_HEADER + '\n';
    }
    hostsContent += missingDomains.map(function(domain) {
        return '0.0.0.0 ' + domain;
    }).join('\n') + '\n';
    if (hostsContent.indexOf(HOSTS_END_MARKER) === -1) {
        hostsContent += HOSTS_END_MARKER + '\n';
    }

    fs.writeFileSync(HOSTS_FILE_PATH, hostsContent);
    return missingDomains.length;
}

function writeFileAtomically(filePath, content, mode) {
    ensureDirectoryExistence(filePath);
    var tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, content);
    if (mode) {
        fs.chmodSync(tempPath, mode);
    }
    fs.renameSync(tempPath, filePath);
}

function installPersistenceFiles() {
    var domainsContent = fs.readFileSync(UPDATE_DOMAINS_FILE, 'utf8');
    writeFileAtomically(PERSISTENT_DOMAINS_PATH, domainsContent, '644');
    writeFileAtomically(PERSISTENT_SCRIPT_PATH, autostartScript, '755');
}

function persistenceState() {
    var scriptExists = fs.existsSync(PERSISTENT_SCRIPT_PATH);
    var domainsExist = fs.existsSync(PERSISTENT_DOMAINS_PATH);
    var current = false;

    if (scriptExists && domainsExist) {
        var scriptContent = fs.readFileSync(PERSISTENT_SCRIPT_PATH, 'utf8');
        var executable = (fs.statSync(PERSISTENT_SCRIPT_PATH).mode & 73) !== 0;
        current = executable && scriptContent.indexOf(PERSISTENCE_MARKER) !== -1;
    }

    return {
        installed: scriptExists,
        current: current
    };
}

service.register('checkPersistentScript', function(message) {
    try {
        var state = persistenceState();
        message.respond({
            returnValue: true,
            // Preserve the upstream UI contract: only a valid current hook counts as installed.
            exists: state.current,
            installed: state.installed,
            current: state.current
        });
    } catch (error) {
        message.respond({
            returnValue: false,
            errorText: error.message
        });
    }
});

service.register('installPersistentScript', function(message) {
    try {
        var wasCurrent = persistenceState().current;
        installPersistenceFiles();
        message.respond({
            returnValue: true,
            message: wasCurrent ? 'Persistent script refreshed successfully' : 'Persistent script installed or upgraded successfully'
        });
    } catch (error) {
        message.respond({
            returnValue: false,
            errorText: error.message
        });
    }
});

service.register('removePersistentScript', function(message) {
    try {
        var removed = false;
        if (fs.existsSync(PERSISTENT_SCRIPT_PATH)) {
            fs.unlinkSync(PERSISTENT_SCRIPT_PATH);
            removed = true;
        }
        if (fs.existsSync(PERSISTENT_DOMAINS_PATH)) {
            fs.unlinkSync(PERSISTENT_DOMAINS_PATH);
            removed = true;
        }
        message.respond({
            returnValue: true,
            message: removed ? 'Persistent script removed successfully' : 'Persistent script does not exist'
        });
    } catch (error) {
        message.respond({
            returnValue: false,
            errorText: error.message
        });
    }
});

// Keep the original autoblock endpoint for backwards compatibility, but install
// the current direct-write persistence hook rather than the upstream Luna retry loop.
service.register('autoblock', function(message) {
    try {
        installPersistenceFiles();
        message.respond({
            returnValue: true,
            response: 'Created or upgraded appupdateblocker persistence script.'
        });
    } catch (error) {
        message.respond({
            returnValue: false,
            errorText: error.stack
        });
    }
});

service.register('checkHostsStatus', function(message) {
    try {
        var updateDomains = readUpdateDomains();
        var hostsContent = fs.readFileSync(HOSTS_FILE_PATH, 'utf8');
        var blockedDomainsCount = updateDomains.filter(function(domain) {
            return hostsContainsDomain(hostsContent, domain);
        }).length;

        message.respond({
            returnValue: true,
            blockedDomainsCount: blockedDomainsCount,
            totalDomainsCount: updateDomains.length,
            allBlocked: updateDomains.length > 0 && blockedDomainsCount === updateDomains.length
        });
    } catch (error) {
        message.respond({
            returnValue: false,
            errorText: error.message
        });
    }
});

service.register('addUpdateDomains', function(message) {
    try {
        var addedCount = addDomainsToHosts();
        message.respond({
            returnValue: true,
            message: 'Added ' + addedCount + ' update domains to hosts file',
            addedCount: addedCount
        });
    } catch (error) {
        message.respond({
            returnValue: false,
            errorText: error.message
        });
    }
});

service.register('removeUpdateDomains', function(message) {
    try {
        var updateDomains = readUpdateDomains();
        var hostsContent = fs.readFileSync(HOSTS_FILE_PATH, 'utf8');
        var lines = hostsContent.split('\n');
        var removedCount = 0;
        var filteredLines = lines.filter(function(line) {
            if (line.trim() === HOSTS_HEADER || line.trim() === HOSTS_END_MARKER) {
                return false;
            }
            var matchesDomain = updateDomains.some(function(domain) {
                return hostLineContainsDomain(line, domain);
            });
            if (matchesDomain) {
                removedCount++;
                return false;
            }
            return true;
        });

        fs.writeFileSync(HOSTS_FILE_PATH, filteredLines.join('\n'));
        message.respond({
            returnValue: true,
            message: 'Removed ' + removedCount + ' update domains from hosts file',
            removedCount: removedCount
        });
    } catch (error) {
        message.respond({
            returnValue: false,
            errorText: error.message
        });
    }
});
