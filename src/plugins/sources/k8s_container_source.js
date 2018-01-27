const Q = require('q');
const K8S = require('kubernetes-client');
const logger = require('../../lib/logger')(__filename);

const TTL = {
    ONE_HOUR: 3600 * 1000,
    ONE_DAY: 24 * 3600 * 1000
};

var Cache = {};

function cached(id, ttl, callback) {
    if (Cache[id] !== undefined) {
        return Cache[id];
    }

    Cache[id] = callback();

    if (ttl > 0) {
        setTimeout(function() {
            delete Cache[id];
        }, ttl);
    }
}

/**
 * Parses kubernetes log filename into its components
 * Example: dexi-firewall-d9jxq_default_dexi-firewall-b0e08c32d3ae3536d701009cc08ec362ea11904679fbee14e89441bc44885d5c.log
 * @param file
 */
function parseFileName(file) {
    return cached('parseFileName:' + file, TTL.ONE_HOUR,
        function() {
        file = file.substr(0, -4); //Cut off .log
        var parts = file.split(/_/g);

        //parts[0] = dexi-firewall-d9jxq
        //parts[1] = default
        //parts[2] = dexi-firewall-b0e08c32d3ae3536d701009cc08ec362ea11904679fbee14e89441bc44885d5c

        var podName = parts[0];
        var namespace = parts[1];

        var lastIx = parts[2].lastIndexOf('-');
        var containerName = parts[2].substr(0, lastIx);
        var dockerId = parts[2].substr(lastIx + 1);

        return {
            podName: podName,
            namespace: namespace,
            containerName: containerName,
            dockerId: dockerId
        };
    });
}

/**
 * Parses kubernetes log lines - which are JSON formatted
 * @param line
 * @returns {{message: *}}
 */
function parseLine(line) {
    try {
        return JSON.parse(line);
    } catch(e) {
        return {log: line};
    }
}

function guessSeverity(log) {
    var rx = /\[(INFO|NOTICE|CRITICAL|ALERT|EMERGENCY|WARN|WARNING|ERR|ERROR|FATAL|TRACE|DEBUG|)\]/i;

    var result = rx.exec(log);

    if (result) {
        switch(result[1].toUpperCase()) {
            case 'WARN':
                return 'WARNING';
            case 'ERR':
                return 'ERROR';
            case 'FATAL':
                return 'CRITICAL';
            case 'TRACE':
                return 'DEFAULT';
        }
        return result[1].toUpperCase();
    }

    return null;
}

/**
 * Get pod via the K8S api given the file components from "parseFileName"
 * @param fileNameComponents
 */
function getPod(fileNameComponents) {
    return cached('pod:' + fileNameComponents.podName, TTL.ONE_HOUR, function() {
        const Core = new K8S.Core(K8S.config.getInCluster());
        var namespace = Core.ns(fileNameComponents.namespace);
        var pod = namespace.pods(fileNameComponents.podName);

        return Q.Promise(function(resolve, reject) {
            pod.get(function(err, podInfo) {
                if (err) {
                    reject(err);
                    return;
                }

                resolve(podInfo);
            });
        });
    });
}

/**
 * Check if k8s resource has owner reference
 * @param resource
 * @returns {*|boolean}
 */
function hasOwner(resource) {
    return (resource.metadata &&
            resource.metadata.ownerReferences &&
            resource.metadata.ownerReferences.length > 0);
}

/**
 * Get owner for resource - returns null promise if no owner ref is available
 *
 * Recurses to the top-most owner (we want to skip replica sets and get to deployments etc.)
 *
 * @param resource
 * @returns {*}
 */
function getOwner(resource) {
    if (!hasOwner(resource)) {
        return Q(null);
    }

    var namespaceId = resource.metadata.namespace || 'default';
    var ownerRef = resource.metadata.ownerReferences[0]; //We just take the first

    var cacheId = 'owner:' + [ownerRef.kind,ownerRef.name].join('/');

    return cached(cacheId, TTL.ONE_HOUR, function() {
        var config = K8S.config.getInCluster();
        var API = null;
        if (ownerRef.apiVersion &&
            ownerRef.apiVersion.indexOf('extensions/') === 0) {
            config.version = ownerRef.apiVersion.split(/\//)[1];
            logger.log('Found extension owner with version: ' + config.version);
            API = new K8S.Extensions(config);
        } else {
            API = new K8S.Core(config);
        }

        var namespace = API.ns(namespaceId);
        var ownerName = ownerRef.name;

        var ownerObj;

        switch (ownerRef.kind.toLowerCase()) {
            case 'replicaset':
                ownerObj = namespace.replicasets(ownerName);
                break;
            case 'statefulset':
                ownerObj = namespace.statefulsets(ownerName);
                break;
            case 'service':
                ownerObj = namespace.services(ownerName);
                break;
            case 'daemonset':
                ownerObj = namespace.daemonsets(ownerName);
                break;
            case 'deployment':
                ownerObj = namespace.deployments(ownerName);
                break;
            case 'job':
                ownerObj = namespace.jobs(ownerName);
                break;
            default:
                logger.error('Unknown k8s owner kind: ' + ownerRef.kind);
                return Q(null);
        }

        return Q.Promise(function(resolve, reject) {
            ownerObj.get(function(err, result) {
                if (err) {
                    reject(err);
                    return;
                }

                if (hasOwner(result)) {
                    //Recurse till we the true owner
                    resolve(getOwner(result));
                } else {
                    resolve(result);
                }
            });
        });
    });
}

/**
 * Null-safe way of getting the docker image from a pod result
 * @param pod
 * @param containerName
 * @returns {*}
 */
function getImageFromPod(pod, containerName) {
    if (!pod ||
        !pod.status ||
        pod.status.containerStatuses) {
        return null;
    }

    var status = _.find(pod.status.containerStatuses, {name: containerName});

    if (status) {
        return status.image;
    }

    return null;
}

/**
 * Main entry point - reads lines from a file and resolves the content against the K8S api. Caches the results
 * @param file
 * @param line
 * @param position
 * @returns {*}
 */
function readLine(file, line, position) {

    var fileNameComponents = parseFileName(file);

    var lineComponents = parseLine(line);

    //Normalize a bit
    if (lineComponents.message) {
        lineComponents.log = lineComponents.message;
        delete lineComponents.message;
    }

    if (!lineComponents.severity && lineComponents.log) {
        lineComponents.severity = guessSeverity(lineComponents.log);
    }

    var pod,owner;
    var podName = fileNameComponents.podName;
    var dockerImage = null;

    return getPod(fileNameComponents).then(function(result) {
        pod = result;
        if (pod && pod.metadata) {
            podName = pod.metadata.name;
        }

        dockerImage = getImageFromPod(pod, fileNameComponents.containerName);

        return getOwner(pod);
    }).then(function(result) {
        owner = result;

        return {
            type: 'k8s_container',
            kubernetes: {
                dockerId: fileNameComponents.dockerId,
                image: dockerImage,
                podName: fileNameComponents.podName,
                containerName: fileNameComponents.containerName,
                namespace: fileNameComponents.namespace,
                resourceKind: owner ? owner.kind : 'Pod',
                resourceName: owner ? owner.metadata.name : podName
            },
            log: lineComponents
        }
    });
}

exports.readLine = readLine;