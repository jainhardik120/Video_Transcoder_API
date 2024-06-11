FROM ubuntu:focal

RUN apt-get update
RUN apt-get install -y curl
RUN curl -sL https://deb.nodesource.com/setup_20.x | bash -
RUN apt-get upgrade -y
RUN apt-get install nodejs -y
RUN apt-get install -y ffmpeg

WORKDIR /home/app

COPY transcoder.sh transcoder.sh
COPY uploader.js uploader.js
COPY package*.json .

RUN npm install

RUN chmod +x transcoder.sh
RUN chmod +x uploader.js

CMD [ "node", "/home/app/uploader.js" ]