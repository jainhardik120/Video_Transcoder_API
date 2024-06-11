"use client"

import React, { useEffect, useRef, useState } from 'react';
import Hls, { Level } from 'hls.js';

export default function Page({ params }: { params: { id: string } }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null); // Reference to hold the Hls instance
  const [levels, setLevels] = useState<Level[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number | null>(null);

  useEffect(() => {
    const videoUrl = `https://s3.eu-north-1.amazonaws.com/video-transcoder.hardikjain.tech/__hls_video_output/${params.id}/master.m3u8`;
    const video = videoRef.current;

    if (Hls.isSupported() && video) {
      const hls = new Hls();
      hlsRef.current = hls; // Store the hls instance in the ref
      hls.loadSource(videoUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play();
        setLevels(hls.levels);
        setCurrentLevel(hls.currentLevel);
      });

      hls.on(Hls.Events.ERROR, function (event, data) {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error('A network error occurred:', data);
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error('A media error occurred:', data);
              hls.recoverMediaError();
              break;
            default:
              console.error('An error occurred:', data);
              hls.destroy();
              break;
          }
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        setCurrentLevel(data.level);
      });

      return () => {
        hls.destroy();
      };
    }
  }, [params.id]);

  const handleResolutionChange = (index: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
    }
  };

  return (
    <>
      <div>
        <video ref={videoRef} controls style={{ width: '100%' }} />
      </div>
      <div id="resolution-controls">
        {levels.map((level, index) => (
          <button
            key={index}
            id={`res-${index}`}
            onClick={() => handleResolutionChange(index)}
            className={currentLevel === index ? 'active-resolution' : ''}
          >
            {level.height}p
          </button>
        ))}
        <button
          id="res-auto"
          onClick={() => handleResolutionChange(-1)}
          className={currentLevel === -1 ? 'active-resolution' : ''}
        >
          Auto
        </button>
      </div>
      <style jsx>{`
        #resolution-controls {
          margin-top: 10px;
        }
        button {
          margin-right: 5px;
          padding: 5px 10px;
          border: none;
          cursor: pointer;
        }
        .active-resolution {
          background-color: #0070f3;
          color: white;
        }
      `}</style>
    </>
  );
}
