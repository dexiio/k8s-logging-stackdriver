FROM node:9.4.0

RUN mkdir -p /var/log

ADD src /opt/logging

WORKDIR /opt/logging

RUN rm -rf node_modules

RUN npm install

#Make sure we log to file and dont recurse
ENV LOG_TO_FILE /var/log/stackdriver-logger.log

CMD [ "node", "/opt/logging/index.js" ]
