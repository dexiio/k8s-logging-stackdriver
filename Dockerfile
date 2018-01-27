FROM node:9.4.0

ADD src /opt/logging

WORKDIR /opt/logging

RUN mkdir -p /var/log

ENV LOG_TO_FILE /var/log/logger.log #Make sure we log to file and dont recurse

RUN npm install

CMD [ "node", "/opt/logging/index.js" ]
