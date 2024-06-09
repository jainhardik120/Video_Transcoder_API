import express from "express";
import http from "http";
import { Redis } from 'ioredis';
import { Server } from "socket.io";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import cors from "cors";
import { z } from "zod";
import { CompleteMultipartUploadCommand, CreateMultipartUploadCommand, S3Client, UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const prisma = new PrismaClient({})

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const s3Client = new S3Client({
  region: process.env.S3_BUCKET_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});


const PORT: number = parseInt(process.env.PORT || "9000");

const httpServer = http.createServer(app);

const subscriber = new Redis(process.env.REDIS_URL || "");

const createVideoSchema = z.object({
  title: z.string(),
  content_type: z.string(),
  fileName: z.string()
});

const getUploadPartUrlSchema = z.object({
  Key: z.string(),
  UploadId: z.string(),
  PartNumbers: z.array(z.number()),
  videoId: z.string(),
});


const completeMultipartUploadSchema = z.object({
  Key: z.string(),
  UploadId: z.string(),
  Parts: z.array(z.object({
    ETag: z.string(),
    PartNumber: z.number()
  })),
  videoId: z.string(),
});

const validate = (schema: z.AnyZodObject) => (req, res, next) => {
  const validation = schema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json(validation.error);
  }
  next();
};

app.get('/', (req, res) => {
  return res.json({ message: "API running successfully" })
});

app.post('/video', validate(createVideoSchema), async (req, res) => {
  try {
    const { title, content_type, fileName } = req.body;
    const video = await prisma.video.create({
      data: {
        title: title,
        rawFileName: fileName
      }
    });
    const video_id = video.id;
    const multipart_upload_command = new CreateMultipartUploadCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: `__raw_uploads/${video_id}/${fileName}`,
      ContentType: content_type
    });
    const multipart_response = await s3Client.send(multipart_upload_command);
    const { UploadId, Key, Bucket } = multipart_response;
    return res.json({ UploadId, Key, Bucket });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/get-upload-part-urls', validate(getUploadPartUrlSchema), async (req, res) => {

  const { Key, UploadId, PartNumbers, videoId } = req.body;

  try {
    await prisma.video.update({
      where: { id: videoId },
      data: { status: 'UPLOADING_RAW' }
    });

    const signedUrls = await Promise.all(PartNumbers.map(async (PartNumber) => {
      const uploadPartCommand = new UploadPartCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key,
        UploadId,
        PartNumber
      });
      const signedUrl = await getSignedUrl(s3Client, uploadPartCommand, { expiresIn: 3600 });
      return { PartNumber, signedUrl };
    }));

    res.json({ signedUrls });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/complete-multipart-upload', validate(completeMultipartUploadSchema), async (req, res) => {
  const { Key, UploadId, Parts } = req.body;
  const completeMultipartUploadCommand = new CompleteMultipartUploadCommand({
    Bucket: 'your-bucket-name',
    Key,
    UploadId,
    MultipartUpload: {
      Parts
    }
  });
  try {
    const completeMultipartUploadResponse = await s3Client.send(completeMultipartUploadCommand);
    await prisma.video.update({
      where: { id: req.body.videoId },
      data: { status: 'QUEUED' }
    });
    res.json(completeMultipartUploadResponse);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  socket.on('subscribe', (channel) => {
    socket.join(channel);
    socket.emit('message', `Joined ${channel}`);
  });
});

async function initRedis() {
  subscriber.psubscribe('logs:*');
  subscriber.on('pmessage', (pattern, channel, message) => {
    console.log(message);
    console.log(channel);
    io.to(channel).emit('message', message);
  });
};

initRedis();

httpServer.listen(PORT, () => {
  console.log(`Server socket running on ${PORT}`)
});