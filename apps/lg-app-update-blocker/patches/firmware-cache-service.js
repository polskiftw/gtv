const SYSTEM_UPDATE_CACHE_DIR = '/mnt/lg/cmn_data/swupdate';
const SYSTEM_UPDATE_IMAGE_INFO = path.join(SYSTEM_UPDATE_CACHE_DIR, 'Image_Update_Info.xml');

function describeSystemUpdateCacheEntry(name) {
    var fullPath = path.join(SYSTEM_UPDATE_CACHE_DIR, name);
    try {
        var stat = fs.lstatSync(fullPath);
        var type = stat.isFile() ? 'file' : (stat.isSymbolicLink() ? 'symlink' : 'other');
        return {
            name: name,
            type: type,
            size: stat.size,
            mtimeMs: stat.mtimeMs || stat.mtime.getTime(),
            deletable: stat.isFile() || stat.isSymbolicLink()
        };
    } catch (error) {
        return {
            name: name,
            type: 'error',
            size: 0,
            mtimeMs: 0,
            deletable: false,
            error: error.message
        };
    }
}

function readSystemUpdatePhase() {
    if (!fs.existsSync(SYSTEM_UPDATE_IMAGE_INFO)) {
        return null;
    }

    try {
        var content = fs.readFileSync(SYSTEM_UPDATE_IMAGE_INFO, 'utf8');
        var match = content.match(/<PHASE>\s*([^<]+?)\s*<\/PHASE>/i);
        return match ? match[1].trim() : null;
    } catch (error) {
        return null;
    }
}

function getSystemUpdateCacheState() {
    var exists = fs.existsSync(SYSTEM_UPDATE_CACHE_DIR);
    var entries = [];

    if (exists) {
        entries = fs.readdirSync(SYSTEM_UPDATE_CACHE_DIR)
            .sort()
            .map(describeSystemUpdateCacheEntry);
    }

    var deletableCount = entries.filter(function(entry) {
        return entry.deletable;
    }).length;

    var totalBytes = entries.reduce(function(total, entry) {
        return total + (entry.type === 'file' ? entry.size : 0);
    }, 0);

    return {
        path: SYSTEM_UPDATE_CACHE_DIR,
        exists: exists,
        entries: entries,
        count: entries.length,
        deletableCount: deletableCount,
        totalBytes: totalBytes,
        phase: readSystemUpdatePhase()
    };
}

service.register('readSystemUpdateCache', function(message) {
    try {
        var state = getSystemUpdateCacheState();
        state.returnValue = true;
        message.respond(state);
    } catch (error) {
        message.respond({
            returnValue: false,
            errorText: error.message
        });
    }
});

service.register('clearSystemUpdateCache', function(message) {
    try {
        if (!fs.existsSync(SYSTEM_UPDATE_CACHE_DIR)) {
            message.respond({
                returnValue: true,
                deleted: [],
                skipped: [],
                message: 'System firmware update cache directory is not present on this TV'
            });
            return;
        }

        var names = fs.readdirSync(SYSTEM_UPDATE_CACHE_DIR).sort();
        var deleted = [];
        var skipped = [];
        var failed = [];

        names.forEach(function(name) {
            var fullPath = path.join(SYSTEM_UPDATE_CACHE_DIR, name);
            try {
                var stat = fs.lstatSync(fullPath);
                if (stat.isFile() || stat.isSymbolicLink()) {
                    fs.unlinkSync(fullPath);
                    deleted.push(name);
                } else {
                    skipped.push(name);
                }
            } catch (error) {
                if (error && error.code === 'ENOENT') {
                    return;
                }
                failed.push(name + ': ' + error.message);
            }
        });

        if (failed.length > 0) {
            message.respond({
                returnValue: false,
                errorText: 'Failed to delete some firmware update cache entries: ' + failed.join('; '),
                deleted: deleted,
                skipped: skipped
            });
            return;
        }

        var summary;
        if (deleted.length === 0) {
            summary = 'No cached system firmware update files were found';
        } else {
            summary = 'Deleted ' + deleted.length + ' cached system firmware update file(s)';
        }
        if (skipped.length > 0) {
            summary += '; left ' + skipped.length + ' director' + (skipped.length === 1 ? 'y' : 'ies') + ' untouched';
        }
        if (deleted.length > 0) {
            summary += '. Power-cycle the TV if the update prompt is still visible';
        }

        message.respond({
            returnValue: true,
            deleted: deleted,
            skipped: skipped,
            message: summary
        });
    } catch (error) {
        message.respond({
            returnValue: false,
            errorText: error.message
        });
    }
});
