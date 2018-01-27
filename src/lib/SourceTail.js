const Tail = require('tail').Tail;
const FS = require('fs');
const logger = require('./logger')(__filename);

function SourceTail(source, file) {
    this.source = source;
    this.file = file;
    this.config = source.config;
    this._tail = null;
    this._currentPosition = 0;
    this._position = 0;
    this._lastSavedPosition = 0;

    var positionSuffix = this.config.position && this.config.position.suffix ?
                                this.config.position.suffix : '.position';
    this._positionFile = file + positionSuffix;
    this._saveInterval = null;
}


SourceTail.prototype = {
    _readPositionFromFile: function() {
        var position = 0;
        if (FS.existsSync(this._positionFile)) {
            position = parseInt(FS.readFileSync(this._positionFile).toString(), 10);

            if (isNaN(position)) {
                position = 0;
            }

            if (position < 0) {
                position = 0
            }

            this._position = position;
        }
    },
    _savePosition: function() {
        if (this._lastSavedPosition === this._position) {
            return;
        }

        FS.writeFile(this._positionFile, '' + this._position);
        this._lastSavedPosition = this._position;
    },
    _startSavingPosition: function() {
        var me = this;
        var interval = this.config.position && this.config.position.interval ? this.config.position.interval : 5000;
        this._saveInterval = setInterval(function() {
            me._savePosition();
        }, interval);
    },
    _stopSavingPosition: function() {
        if (this._saveInterval) {
            clearInterval(this._saveInterval);
            this._saveInterval = null;
        }
    },
    _isSavingPosition: function() {
        return this.config.position && this.config.position.save;
    },
    _startTail: function() {
        var fromBeginning = this._isSavingPosition();
        var me = this;


        var tail = new Tail(this.file, {
            fromBeginning: fromBeginning
        });


        tail.on("line", function(data) {
            if (me._currentPosition < me._position) {
                me._currentPosition++;
                return; //Ignore these lines
            }
            me._currentPosition++;
            me._position = me._currentPosition;
            me.source._handleLineFromFile(me.file, data, me._position);

        });

        tail.on("error", function(err) {
            me.source._handleErrorFromFile(me.file, err, me._position);
        });

        logger.log('Started tailing file: ' + this.file);

        this._tail = tail;
    },
    _stopTail: function() {
        if (this._tail) {
            this._tail.unwatch();
            this._tail = null;
            logger.log('Stopped tailing file: ' + this.file);
        }
    },
    stop: function() {
        this._stopTail();
        this._stopSavingPosition();

    },
    start: function() {
        if (this._isSavingPosition()) {
            this._readPositionFromFile();
            this._startSavingPosition();
        }

        this._startTail();
    }
};



module.exports = SourceTail;