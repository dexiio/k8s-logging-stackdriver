const Config = require('./config');
const Source = require('./lib/Source');

const Sources = Config.sources.map(function(config) {
    return new Source(config);
});

Sources.forEach(function(source) {
    source.start();
});

