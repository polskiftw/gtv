// Additional appInstallService cache: independent of the upstream updateInfo control.
const UPDATE_DEPENDENCY_INFO_PATH = '/mnt/lg/cmn_data/var/palm/data/com.webos.appInstallService/updateDependencyInfo';

function getUpdateDependencyInfoState() {
    if (!fs.existsSync(UPDATE_DEPENDENCY_INFO_PATH)) {
        return { exists: false, content: '' };
    }
    var stat = fs.lstatSync(UPDATE_DEPENDENCY_INFO_PATH);
    if (!stat.isFile()) {
        throw new Error('updateDependencyInfo is not a regular file; refusing to read or overwrite it');
    }
    return { exists: true, content: fs.readFileSync(UPDATE_DEPENDENCY_INFO_PATH, 'utf8') };
}

service.register('readUpdateDependencyInfo', function(message) {
    try {
        var state = getUpdateDependencyInfoState();
        message.respond({ returnValue: true, exists: state.exists, content: state.content });
    } catch (error) {
        message.respond({ returnValue: false, errorText: error.message });
    }
});

service.register('clearUpdateDependencyInfo', function(message) {
    try {
        var state = getUpdateDependencyInfoState();
        if (!state.exists) {
            message.respond({ returnValue: true, message: 'Dependency update cache is not present; nothing to clear' });
            return;
        }
        if (!state.content.trim()) {
            message.respond({ returnValue: true, message: 'Dependency update cache is already empty' });
            return;
        }

        var data;
        try {
            data = JSON.parse(state.content);
        } catch (error) {
            throw new Error('Dependency update cache is not valid JSON; refusing to overwrite unexpected data');
        }

        // Preserve the JSON container type instead of assuming this cache is an array.
        var empty;
        if (Array.isArray(data)) {
            empty = '[]';
            if (data.length === 0) {
                message.respond({ returnValue: true, message: 'Dependency update cache is already empty' });
                return;
            }
        } else if (data !== null && typeof data === 'object') {
            empty = '{}';
            if (Object.keys(data).length === 0) {
                message.respond({ returnValue: true, message: 'Dependency update cache is already empty' });
                return;
            }
        } else {
            throw new Error('Dependency update cache has an unexpected JSON type; refusing to overwrite it');
        }

        fs.writeFileSync(UPDATE_DEPENDENCY_INFO_PATH, empty, 'utf8');
        message.respond({
            returnValue: true,
            message: 'Dependency update cache cleared. Fully restart the TV before testing the affected app.'
        });
    } catch (error) {
        message.respond({ returnValue: false, errorText: error.message });
    }
});
