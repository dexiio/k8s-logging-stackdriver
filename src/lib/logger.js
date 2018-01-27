const FS = require('fs');

const LOG_FILE = process.env.LOG_TO_FILE;

module.exports = function(file) {

    return {
        log: function(msg) {
            if (LOG_FILE) {
                FS.appendFile(LOG_FILE, file + ' - [INFO] - ' + msg);
            } else {
                console.log('%s: %s', file, msg);
            }

        },
        error: function(msg) {
            if (LOG_FILE) {
                FS.appendFile(LOG_FILE, file + ' - [ERROR] - ' + msg);
            } else {
                console.error('%s: %s', file, msg);
            }
        },
        warn: function(msg) {
            if (LOG_FILE) {
                FS.appendFile(LOG_FILE, file + ' - [WARNING] - ' + msg);
            } else {
                console.warn('%s: %s', file, msg);
            }
        }
    }
};