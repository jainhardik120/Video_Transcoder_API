import { CompleteMultipartUploadCommand, CreateMultipartUploadCommand, S3Client, UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { TranscodeJobParameters, sendStatusUpdate } from ".";
import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";
const router = Router();

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


const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID_N || "";
const SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY_N || "";

const config = {
  CLUSTER: 'arn:aws:ecs:ap-south-1:425458867902:cluster/VideoTranscoderCluster',
  TASK: 'arn:aws:ecs:ap-south-1:425458867902:task-definition/video-transcoder-task:3'
}

const prisma = new PrismaClient({})

const s3Client = new S3Client({
  region: process.env.S3_BUCKET_REGION_N,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY
  }
});

const ecsClient = new ECSClient({
  region: 'ap-south-1',
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY
  }
})

router.post('/video', validate(createVideoSchema), async (req, res) => {
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
      Bucket: process.env.S3_BUCKET_NAME_N,
      Key: `__raw_uploads/${video_id}/${fileName}`,
      ContentType: content_type
    });
    const multipart_response = await s3Client.send(multipart_upload_command);
    const { UploadId, Key, Bucket } = multipart_response;
    return res.json({ UploadId, Key, Bucket, video_id });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/get-upload-part-urls', validate(getUploadPartUrlSchema), async (req, res) => {

  const { Key, UploadId, PartNumbers, videoId } = req.body;

  try {
    await sendStatusUpdate(videoId, "UPLOADING");
    const signedUrls = await Promise.all(PartNumbers.map(async (PartNumber) => {
      const uploadPartCommand = new UploadPartCommand({
        Bucket: process.env.S3_BUCKET_NAME_N,
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

router.post('/complete-multipart-upload', validate(completeMultipartUploadSchema), async (req, res) => {
  const { Key, UploadId, Parts, videoId } = req.body;
  const completeMultipartUploadCommand = new CompleteMultipartUploadCommand({
    Bucket: process.env.S3_BUCKET_NAME_N,
    Key,
    UploadId,
    MultipartUpload: {
      Parts
    }
  });
  try {
    await s3Client.send(completeMultipartUploadCommand);
    const updatedVideo = await sendStatusUpdate(videoId, "QUEUED");
    const jobParameters: TranscodeJobParameters = {
      fileName: updatedVideo.rawFileName,
      videoId: updatedVideo.id
    }
    const command = new RunTaskCommand({
      cluster: config.CLUSTER,
      taskDefinition: config.TASK,
      launchType: 'FARGATE',
      count: 1,
      networkConfiguration: {
        awsvpcConfiguration: {
          assignPublicIp: 'ENABLED',
          subnets: ['subnet-04ccf05eaa460a368', 'subnet-09cffca8375ed2215', 'subnet-07b168e5dbbf8419c'],
          securityGroups: ['sg-04db5d28f40cdf906']
        }
      },
      overrides: {
        containerOverrides: [
          {
            name: 'transcoder-container', environment: [
              { name: "FILENAME", value: jobParameters.fileName },
              { name: "REDIS_URL", value: process.env.REDIS_URL },
              { name: "S3_ACCESS_KEY_ID", value: AWS_ACCESS_KEY_ID },
              { name: "S3_BUCKET_NAME", value: process.env.S3_BUCKET_NAME_N },
              { name: "S3_REGION", value: process.env.S3_BUCKET_REGION_N },
              { name: "S3_SECRET_ACCESS_KEY", value: SECRET_ACCESS_KEY },
              { name: "VIDEO_ID", value: jobParameters.videoId }
            ]
          }
        ]
      }
    });
    await ecsClient.send(command);
    return res.json({ message: "Added to queue" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/videos', async (req, res) => {
  try {
    const videos = await prisma.video.findMany({
      where: {
        status: "COMPLETED"
      }
    });
    return res.json(videos);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
})

export default router;