const path = require("path");
const fs = require("fs");
const Redis = require('ioredis');

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const mime = require("mime-types");
const { exec } = require("child_process");

const publisher = new Redis(process.env.REDIS_URL);

const directory_path = path.join(__dirname, 'hls_video_output');

const s3Client = new S3Client({
  region: process.env.S3_REGION,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
  }
})

const VIDEO_ID = process.env.VIDEO_ID

function publishLog(log) {
  console.log(log);
  publisher.publish(`logs:${VIDEO_ID}`, JSON.stringify({ log }))
}

async function init() {
  publishLog("Started...");

  const p = exec("bash transcoder.sh");

  p.stdout.on('data', function (data) {
    publishLog(data.toString());
  })

  p.stdout.on('error', function (data) {
    publishLog(`Error : ${data.toString()}`);
  })

  p.on('close', async function () {
    publishLog("Completed Transcoding");
    publishLog("Starting file upload");
    const hlsFolderContents = fs.readdirSync(directory_path, {
      recursive: true
    });
    for (const file of hlsFolderContents) {
      const filePath = path.join(directory_path, file);
      if (fs.lstatSync(filePath).isDirectory()) continue;

      publishLog(`Uploading ${filePath}`);

      const command = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: `__hls_video_output/${VIDEO_ID}/${file}`,
        Body: fs.createReadStream(filePath),
        ContentType: mime.lookup(filePath)
      });

      await s3Client.send(command);
      publishLog(`Uploaded ${filePath}`);
    }
    publisher.quit();
  })
}

init();