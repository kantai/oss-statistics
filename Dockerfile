FROM node:8

WORKDIR /src/oss-statistics

COPY . .

RUN npm i && npm i -g .

CMD fetch-data $START_DATE && analyze $START_DATE $END_DATE
