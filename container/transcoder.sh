#!/bin/sh

S3_REGION="${S3_REGION}"
S3_BUCKET_NAME="${S3_BUCKET_NAME}"
VIDEO_ID="${VIDEO_ID}"
FILENAME="${FILENAME}"

input="${FILENAME}"

echo "Downloading file from S3"

s3_url="https://s3.${S3_REGION}.amazonaws.com/${S3_BUCKET_NAME}/__raw_uploads/${VIDEO_ID}/${input}"

curl -O "$s3_url"

output_dir="hls_video_output"
mkdir -p $output_dir

segment_time=10

echo "Transcoding 1080p video"

ffmpeg -i $input -vf "scale=w=1920:h=1080" -c:a aac -strict -2 -c:v h264 -hls_time $segment_time -hls_playlist_type vod -hls_segment_filename "$output_dir/1080p_%03d.ts" "$output_dir/1080p.m3u8"

echo "Transcoding 720p video"

ffmpeg -i $input -vf "scale=w=1280:h=720" -c:a aac -strict -2 -c:v h264 -hls_time $segment_time -hls_playlist_type vod -hls_segment_filename "$output_dir/720p_%03d.ts" "$output_dir/720p.m3u8"

echo "Transcoding 480p video"

ffmpeg -i $input -vf "scale=w=854:h=480" -c:a aac -strict -2 -c:v h264 -hls_time $segment_time -hls_playlist_type vod -hls_segment_filename "$output_dir/480p_%03d.ts" "$output_dir/480p.m3u8"

cat << EOF > $output_dir/master.m3u8
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080
1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1280x720
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=854x480
480p.m3u8
EOF