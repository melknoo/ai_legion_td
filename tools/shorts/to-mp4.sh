#!/bin/sh
# Converts a recorded showcase clip (WebM from `?showcase&rec`) into an H.264 MP4 below 10 MB, so
# the Chrome extension can upload it to YouTube, with the quiet game sound loudness-normalised.
# Usage: sh tools/shorts/to-mp4.sh media/clips/legion-s4-w25-l0-canopy.webm [...]
# Needs ffmpeg/ffprobe on PATH or in $FFMPEG_DIR (winget: Gyan.FFmpeg).
set -e
FF=${FFMPEG_DIR:+$FFMPEG_DIR/}
for in in "$@"; do
  out="${in%.webm}.mp4"
  # MediaRecorder WebMs carry no duration: take the last video packet's timestamp.
  dur=$("${FF}ffprobe" -v error -select_streams v -show_entries packet=pts_time -of csv=p=0 "$in" | tail -1 | cut -d. -f1)
  # 9.3 MB budget minus audio, capped at 2.6 Mbit/s (looks like the WebM for pixel art).
  vb=$(( 9300 * 8 / (${dur:-58} + 1) - 140 ))
  [ "$vb" -gt 2600 ] && vb=2600
  "${FF}ffmpeg" -hide_banner -loglevel error -y -i "$in" -r 30 \
    -c:v libx264 -preset slow -b:v "${vb}k" -maxrate "$((vb * 5 / 4))k" -bufsize "$((vb * 2))k" -tune animation -pix_fmt yuv420p \
    -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:a aac -b:a 128k -ar 48000 -movflags +faststart "$out"
  echo "$out: $(wc -c < "$out") bytes, ${dur}s, ${vb}k"
done
