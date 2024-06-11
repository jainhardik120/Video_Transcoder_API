import express from "express";
import http from "http";
import { Redis } from 'ioredis';
import { Server } from "socket.io";
import dotenv from "dotenv";
import { PrismaClient, videoStatus } from "@prisma/client";
import cors from "cors";
import router from "./route-handlers";

dotenv.config();

const prisma = new PrismaClient({})
const app = express();
app.use(cors());
app.use(express.json());

const PORT: number = parseInt(process.env.PORT || "9000");
const httpServer = http.createServer(app);

const logSubscriber = new Redis(process.env.REDIS_URL || "");
const jobStatusSubscriber = new Redis(process.env.REDIS_URL || "");

export const sendStatusUpdate = async (videoId: string, status: videoStatus) => {
  console.log(`${videoId}: ${status}`)
  const updatedVideo = await prisma.video.update({
    where: { id: videoId },
    data: { status: status }
  })
  io.to(`logs:${videoId}`).emit('message', JSON.stringify({
    type: 'status-update',
    status: status
  }))
  return updatedVideo
}

const sendLogMessage = async (videoId: string, message: string) => {
  console.log(`${videoId}: ${message}`)
  io.to(`logs:${videoId}`).emit('message', JSON.stringify({
    type: 'log-message',
    message: message
  }));
}

export interface TranscodeJobParameters {
  fileName: string,
  videoId: string
}

app.get('/', (req, res) => {
  return res.json({ message: "API running successfully" })
});

app.use('/', router);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  socket.on('subscribe', (channel) => {
    console.log(`${socket.id} subscribe to ${channel}`)
    socket.join(channel);
  });
});

async function initRedis() {
  logSubscriber.psubscribe('logs:*');
  logSubscriber.on('pmessage', (pattern, channel, message) => {
    const { log } = JSON.parse(message);
    sendLogMessage(channel.split(":")[1], log);
  });
  jobStatusSubscriber.subscribe('job-updates');
  jobStatusSubscriber.on('message', async (channel, message) => {
    const { videoId, status } = JSON.parse(message);
    if (status === 'PROCESSING' || status === 'FAILED' || status === 'COMPLETED') {
      sendStatusUpdate(videoId, status);
    }
  })
};

initRedis();

httpServer.listen(PORT, () => {
  console.log(`Server socket running on ${PORT}`)
});