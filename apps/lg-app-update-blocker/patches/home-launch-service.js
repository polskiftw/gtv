// GTV: reversible on-disk Content Store appinfo.json launch-policy override.
// Original app ID, Home tile and app contents remain unchanged. SAM rereads
// appinfo.json at a full TV restart. Do not restart SAM from this service.
const HOME_LAUNCH_STORE_ROOT = '/media/cryptofs/apps/usr/palm/applications';
const HOME_LAUNCH_RECORD_DIR = '/var/lib/webosbrew/appupdateblocker/home-launch';
const HOME_LAUNCH_FORBIDDEN = {
    'com.webos.app.home': true,
    'com.webos.app.settings': true,
    'org.webosbrew.appupdateblocker': true,
    'org.webosbrew.hbchannel': true
};

function homeLaunchValidId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{1,159}$/.test(id) &&
        !Object.prototype.hasOwnProperty.call(HOME_LAUNCH_FORBIDDEN, id);
}

function homeLaunchReadJson(file, expectedId) {
    var stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512 * 1024) {
        throw new Error('App manifest/backup is not a normal JSON file');
    }
    var info = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!info || Array.isArray(info) || typeof info !== 'object' || info.id !== expectedId) {
        throw new Error('App manifest/backup ID does not match the installed app');
    }
    return { info: info, stat: stat };
}

function homeLaunchApp(id) {
    if (!homeLaunchValidId(id)) throw new Error('Invalid or protected application ID');
    var directory = path.join(HOME_LAUNCH_STORE_ROOT, id);
    var file = path.join(directory, 'appinfo.json');
    if (!fs.existsSync(file)) return { supported: false, reason: 'App is not installed under the writable LG Content Store application directory' };

    // Refuse app aliases/symlinks escaping the expected Content Store root.
    var rootReal = fs.realpathSync(HOME_LAUNCH_STORE_ROOT);
    var directoryReal = fs.realpathSync(directory);
    if (directoryReal !== path.join(rootReal, id) || fs.lstatSync(directory).isSymbolicLink()) {
        throw new Error('App directory is redirected; refusing to change it');
    }
    if (fs.realpathSync(file) !== path.join(directoryReal, 'appinfo.json')) {
        throw new Error('App manifest is redirected; refusing to change it');
    }
    var parsed = homeLaunchReadJson(file, id);
    if (Object.prototype.hasOwnProperty.call(parsed.info, 'checkUpdateOnLaunch') &&
        typeof parsed.info.checkUpdateOnLaunch !== 'boolean') {
        throw new Error('Unexpected existing checkUpdateOnLaunch type; refusing to change it');
    }
    return { supported: true, path: file, info: parsed.info, stat: parsed.stat };
}

function homeLaunchRecordPath(id) {
    return path.join(HOME_LAUNCH_RECORD_DIR, id + '.json');
}

function homeLaunchRecord(id) {
    var file = homeLaunchRecordPath(id);
    if (!fs.existsSync(file)) return null;
    var parsed = homeLaunchReadJson(file, id).info;
    if (typeof parsed.originalPresent !== 'boolean' ||
        (parsed.originalPresent && typeof parsed.originalValue !== 'boolean')) {
        throw new Error('Saved launch-policy backup is invalid; refusing to overwrite anything');
    }
    return parsed;
}

function homeLaunchAtomicWrite(file, content, existingStat) {
    var tmp = file + '.gtv-' + process.pid + '.tmp';
    // Never update the installed manifest in place: a crash must not leave half a JSON file.
    try {
        fs.writeFileSync(tmp, content, { encoding: 'utf8', mode: existingStat ? (existingStat.mode & 4095) : 384, flag: 'wx' });
        if (existingStat) {
            if (process.getuid && process.getuid() === 0) fs.chownSync(tmp, existingStat.uid, existingStat.gid);
            fs.chmodSync(tmp, existingStat.mode & 4095);
        }
        fs.renameSync(tmp, file);
    } catch (error) {
        try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (ignored) {}
        throw error;
    }
}

function homeLaunchMakeRecordDir() {
    ensureDirectoryExistence(path.join(HOME_LAUNCH_RECORD_DIR, 'placeholder'));
    fs.chmodSync(HOME_LAUNCH_RECORD_DIR, 448);
}

function homeLaunchReadState(id) {
    var app = homeLaunchApp(id);
    var record = homeLaunchRecord(id);
    return {
        supported: app.supported,
        reason: app.reason || '',
        managed: !!record,
        disabledOnDisk: app.supported ? app.info.checkUpdateOnLaunch === false : false,
        originalValue: record && record.originalPresent ? record.originalValue : null,
        needsFullRestart: !!record,
        installedVersion: app.supported ? (app.info.version || '') : ''
    };
}

service.register('readHomeLaunchOverride', function (message) {
    try {
        var id = message.payload && message.payload.id;
        var state = homeLaunchReadState(id);
        state.returnValue = true;
        message.respond(state);
    } catch (error) {
        message.respond({ returnValue: false, errorText: error.message });
    }
});

service.register('enableHomeLaunchOverride', function (message) {
    try {
        var id = message.payload && message.payload.id;
        var app = homeLaunchApp(id);
        if (!app.supported) throw new Error(app.reason);
        var record = homeLaunchRecord(id);
        var createdRecord = false;
        if (!record) {
            homeLaunchMakeRecordDir();
            record = {
                id: id,
                originalPresent: Object.prototype.hasOwnProperty.call(app.info, 'checkUpdateOnLaunch'),
                originalValue: app.info.checkUpdateOnLaunch === true,
                originalVersion: app.info.version || ''
            };
            // Save the *previous* policy before replacing the installed manifest.
            homeLaunchAtomicWrite(homeLaunchRecordPath(id), JSON.stringify(record, null, 2) + '\n', null);
            createdRecord = true;
        }
        try {
            if (app.info.checkUpdateOnLaunch !== false) {
                app.info.checkUpdateOnLaunch = false;
                homeLaunchAtomicWrite(app.path, JSON.stringify(app.info, null, 2) + '\n', app.stat);
            }
        } catch (writeError) {
            // If patching a read-only app failed, remove the record we just made.
            // No installed file was replaced because atomic rename is the final step.
            if (createdRecord) {
                try { fs.unlinkSync(homeLaunchRecordPath(id)); } catch (ignored) {}
            }
            throw writeError;
        }
        message.respond({
            returnValue: true, id: id,
            message: 'Home tile update check disabled on disk. Fully restart the TV once (not just standby) to apply. The original app icon remains unchanged.'
        });
    } catch (error) {
        message.respond({ returnValue: false, errorText: error.message });
    }
});

service.register('restoreHomeLaunchOverride', function (message) {
    try {
        var id = message.payload && message.payload.id;
        var app = homeLaunchApp(id);
        if (!app.supported) throw new Error(app.reason);
        var record = homeLaunchRecord(id);
        if (!record) {
            message.respond({ returnValue: true, message: 'No saved Home tile override exists for this app' });
            return;
        }
        if (record.originalPresent) app.info.checkUpdateOnLaunch = record.originalValue;
        else delete app.info.checkUpdateOnLaunch;
        homeLaunchAtomicWrite(app.path, JSON.stringify(app.info, null, 2) + '\n', app.stat);
        fs.unlinkSync(homeLaunchRecordPath(id));
        message.respond({
            returnValue: true, id: id,
            message: 'Original app launch policy restored. Fully restart the TV once to reload it.'
        });
    } catch (error) {
        message.respond({ returnValue: false, errorText: error.message });
    }
});
