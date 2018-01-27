FROM node:9.4.0

RUN mkdir -p /var/log

RUN mkdir -p /opt/logging

WORKDIR /opt/logging

ADD src/package.json package.json

RUN npm install

ADD src/index.js index.js

ADD src/config.js config.js

ADD src/lib lib

ADD src/plugins plugins


#Make sure we log to file and dont recurse
ENV LOG_TO_FILE /var/log/stackdriver-logger.log

CMD [ "node", "/opt/logging/index.js" ]
