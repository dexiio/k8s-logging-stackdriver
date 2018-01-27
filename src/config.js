module.exports = {
    "sources": [
        {
            name: 'k8s_containers',
            position: {
                //If true - stores file position and reads log files from top
                // - if false just tails log files and gets new lines
                save: false,

                //How often to write position to disk
                interval: 1000,

                //The position files will be named after the log files - with this suffix appended
                suffix: '.position'
            },
            addons: {
                //Add these properties to all log entries
            },
            baseDir: '/var/log/containers',
            path: '*.log',
            handler: require('./plugins/sources/k8s_container_source'),
            targets: {
                stackdriver: {
                    handler: require('./plugins/targets/stackdriver_target')
                }
            }
        }
    ]
};