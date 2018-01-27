const FS = require('fs');

const LOG_FILE = process.env.LOG_TO_FILE;

module.exports = function(file) {

    return {
        isDebug: function() {
            return !!process.env.DEBUG;
        },
        debug: function(msg) {
            if (!this.isDebug()) {
                return;
            }

            if (LOG_FILE) {
                FS.appendFile(LOG_FILE, new Date() + ' - ' + file + ' - [DEBUG] - ' + msg + '\n');
            } else {
                console.log('%s: %s', file, msg);
            }
        },
        log: function(msg) {
            if (LOG_FILE) {
                FS.appendFile(LOG_FILE, new Date() + ' - ' + file + ' - [INFO] - ' + msg + '\n');
            } else {
                console.log('%s: %s', file, msg);
            }
        },
        error: function(msg) {
            if (LOG_FILE) {
                FS.appendFile(LOG_FILE, new Date() + ' - ' + file + ' - [ERROR] - ' + msg + '\n');
            } else {
                console.error('%s: %s', file, msg);
            }
        },
        warn: function(msg) {
            if (LOG_FILE) {
                FS.appendFile(LOG_FILE, new Date() + ' - ' + file + ' - [WARNING] - ' + msg + '\n');
            } else {
                console.warn('%s: %s', file, msg);
            }
        }
    }
};