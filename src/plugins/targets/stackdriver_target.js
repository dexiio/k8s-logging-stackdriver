const Q = require('q');
const LoggingSDK = require('@google-cloud/logging');
const _ = require('lodash');
const logger = require('../../lib/logger')(__filename);

const WRITE_DELAY = 60000;
const FLUSH_DELAY = WRITE_DELAY - 10000;
const LOGGER_EXPIRE = 120000;

const Logging = new LoggingSDK();

var StackdriverLoggers = {};

setInterval(cleanUpLoggers, LOGGER_EXPIRE); //Job that makes sure we clean up old loggers

/**
 * Main entry point for target
 * @param id
 * @param file
 * @param logEntry
 */
function appendLog(id, file, logEntry) {
    switch (logEntry.type) {
        case 'k8s_container':
            return appendK8SContainerLog(id, file, logEntry);
        default:
            logger.error('Unknown log entry type: ' + logEntry.type);
    }
}

/**
 * Gets logger and maintains a map of active loggers that it flushes asyncly
 * @param name
 * @returns {*}
 */
function getLogger(name) {
    if (!StackdriverLoggers[name]) {
        StackdriverLoggers[name] = {
            logger: Logging.log(name),
            pending: [],
            lastWrite: null,
            timeout: null,
            maybeFlush: function() {
                if (this.pending.length > 50) {
                    return this.flush();
                }
                
                var timeSinceFlush = Date.now() - this.lastWrite;
                
                if (timeSinceFlush > FLUSH_DELAY) {
                    return this.flush();
                }
                
                this.scheduleFlush();
            },
            scheduleFlush: function() {
                if (this.timeout) {
                    //Already scheduled;
                    return;
                }
                
                var me = this;
                this.timeout = setTimeout(function() {
                    me.timeout = null;
                    me.flush();
                }, WRITE_DELAY);
            },
            append: function(metadata, log) {
                this.pending(this.logger.entry(metadata, log));
                this.maybeFlush();
            },
            flush: function() {
                var chunk = this.pending;
                this.pending = [];
                if (chunk.length > 0) {
                    this.lastWrite = Date.now();
                    return this.logger.write(chunk).catch(function(err) {
                        logger.warn('Failed to flush ' + chunk.length + ' chunks to stackdriver:' + err);
                    });
                }
            }
        }
    }
    
    return StackdriverLoggers[name]
}

/**
 * Cleans up old loggers
 */
function cleanUpLoggers() {
    var expired = [];
    _.forEach(StackdriverLoggers, function(logger, id) {
        if (logger.pending.length > 0) {
            return false;
        }

        var timeSinceFlush = Date.now() - logger.lastWrite;

        if (timeSinceFlush > LOGGER_EXPIRE) {
            expired.push(id);
        }
    });

    expired.forEach(function(id) {
        delete StackdriverLoggers[id];
    });
}

/**
 * Appends k8s container logs to Stack driver - formatting it the same way as GKE does
 * @param id
 * @param file
 * @param logEntry
 */
function appendK8SContainerLog(id, file, logEntry) {

    var logName = logEntry.kubernetes.resourceName;

    var logger = getLogger(logName);

    const metadata = {
        severity: logEntry.log.severity || 'DEFAULT',
        labels: {
            'compute.googleapis.com/resource_name':  process.env.STACKDRIVER_VM_ID,
            'container.googleapis.com/namespace_name':  logEntry.kubernetes.namespace,
            'container.googleapis.com/pod_name':  logEntry.kubernetes.podName,
            'container.googleapis.com/stream':  logEntry.log.stream || 'stdout'
        },
        timestamp: logEntry.log.time, //Must be "2018-01-27T14:21:38.090293793Z"
        resource: {
            type: 'container',
            labels: {
                cluster_name:  process.env.STACKDRIVER_CLUSTER,
                container_name:  logEntry.kubernetes.resourceName,
                instance_id:  logEntry.kubernetes.dockerId,
                namespace_id:  logEntry.kubernetes.namespace,
                pod_id:  logEntry.kubernetes.podName,
                project_id:  process.env.GOOGLE_CLOUD_PROJECT,
                zone:  process.env.STACKDRIVER_ZONE
            }
        }
    };

    logger.append(metadata, logEntry.log.log);
}

exports.appendLog = appendLog;