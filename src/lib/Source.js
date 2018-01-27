const GlobSync = require("glob").sync;
const Path = require('path');
const FS = require('fs');
const _ = require('lodash');
const Q = require('q');
const logger = require('./logger')(__filename);

const SourceTail = require('./SourceTail');

function Source(config) {
    this.config = config;
    this._tails = {};
    this._watcher = null;
}

Source.prototype = {
    _watchForChanges: function() {
        this._stopWatching();
        var me = this;
        this._watcher = FS.watch(this.config.baseDir, function() {
            me.refresh();
        });
    },
    _stopWatching: function() {
        if (this._watcher) {
            this._watcher.close();
            this._watcher = null;
        }
    },
    _getFullPath: function() {
        return Path.join(this.config.baseDir, this.config.path);
    },
    _getFileList: function() {
        var fullPath = this._getFullPath();
        return GlobSync(fullPath);
    },
    _handleLineFromFile: function(file, line, position) {
        var me = this;
        return Q(this.config.handler.readLine(file, line, position)).then(function(logEntry) {

            if (me.config.addons) {
                _.extend(logEntry, me.config.addons);
            }

            var promises = [];

            _.forEach(me.config.targets, function(target, id) {
                promises.push(Q(target.handler.appendLog(id, file, logEntry)));
            });

            return Q.allSettled(promises);
        });
    },
    _handleErrorFromFile: function(file, error) {
        //Ignore for now
    },
    _addTail: function(file) {
        this._tails[file] = new SourceTail(this, file);
        this._tails[file].start();
    },
    _removeTail: function(file) {
        if (!this._tails[file]) {
            return;
        }

        this._tails[file].stop();

        delete this._tails[file];
    },
    refresh: function() {
        var files = this._getFileList();

        var removedFiles = _.keys(this._tails);

        files.forEach(function(file) {
            if (!this._tails[file]) {
                this._addTail(file);
            }
            _.pull(removedFiles, file);

        }, this);

        removedFiles.forEach(function(file) {
            this._removeTail(file);
        }, this);
    },
    start: function() {
        this._watchForChanges();
        this.refresh();
    },
    stop: function() {
        this._stopWatching();

        var allTails = _.keys(this._tails);

        allTails.forEach(function(file) {
            this._removeTail(file);
        }, this);
    }
};


module.exports = Source;