"use client";

import axios from "axios";
import { FormEvent, useEffect, useState } from "react";
import { IOContext, IOContextProvider, useIOContext } from "./IOContext";
import Link from "next/link";

type UploadInfo = {
  UploadId: string;
  Key: string;
  Bucket: string;
  video_id: string
}

export const hostName: string = process.env.HOST_URL || "http://localhost:9001";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");

  const [videos, setVideos] = useState<any[]>([]);

  const context: IOContext = useIOContext();

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file || title.length === 0) {
      return;
    }
    try {
      const response = await axios.post(`${hostName}/video`, {
        title: title,
        fileName: file.name,
        content_type: file.type
      });
      context.startSocket(response.data.video_id);
      const chunkSize = 5 * 1024 * 1024;
      const chunks = [];
      const partNumbers = [];
      let partNumber = 1;
      for (let start = 0; start < file.size; start += chunkSize) {
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);
        chunks.push(chunk);
        partNumbers.push(partNumber);
        partNumber++;
      }
      const signedUrls = await axios.post(`${hostName}/get-upload-part-urls`, {
        Key: response.data.Key,
        UploadId: response.data.UploadId,
        videoId: response.data.video_id,
        PartNumbers: partNumbers
      });
      const uploadPromises = chunks.map((chunk, index) => {
        const { signedUrl, PartNumber } = signedUrls.data.signedUrls[index];
        return axios.put(signedUrl, chunk, {
          headers: {
            'Content-Type': file.type
          }
        }).then(uploadResponse => ({
          ETag: uploadResponse.headers.etag,
          PartNumber: PartNumber
        }));
      });
      const uploadParts = await Promise.all(uploadPromises);
      await axios.post(`${hostName}/complete-multipart-upload`, {
        Key: response.data.Key,
        UploadId: response.data.UploadId,
        Parts: uploadParts,
        videoId: response.data.video_id
      });
    } catch (error) {
      console.log(error);
    }
  }

  useEffect(() => {
    const getVideos = async () => {
      try {
        const response = await axios.get(`${hostName}/videos`);
        console.log(response.data);
        setVideos(response.data);
      } catch (error) {
        console.log(error);
      }
    }
    getVideos();
  }, [])

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 p-24">
      {
        videos.map((video, index) => (
          <div key={index}>
            <Link href={`/${video.id}`}>
              {video.title}
            </Link>
          </div>
        ))
      }
      <h1 className="text-2xl">Video Transcoding Service</h1>
      <form className="flex flex-col gap-8 items-center" onSubmit={onSubmit}>
        <div className="w-full flex justify-between">
          <label htmlFor="file">Video File</label>
          <input type="file" id="file" onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              setFile(e.target.files[0]);
            }
          }} />
        </div>
        <div className="w-full flex justify-between">
          <label htmlFor="title">Video Title</label>
          <input type="text" id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="w-full flex justify-between">
          <button type="submit">
            Upload
          </button>
        </div>
      </form>
      <div>
        {context.status}
        <ul>
          {context.messages.map((message, index) => (
            <li key={index}>{message}</li>
          ))}
        </ul>
      </div>
    </main>
  );
}