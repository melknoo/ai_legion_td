import Phaser from 'phaser';

const FPS = 30;
const VIDEO_BITS = 12_000_000;
const MIME_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

/**
 * Records the game canvas plus the game's sound into a WebM file. The sound only reaches the
 * clip once the browser unlocked audio, i.e. after a click on the page.
 */
export class ClipRecorder {
  private readonly recorder: MediaRecorder;
  private readonly chunks: Blob[] = [];
  private readonly detachAudio: () => void = () => {};

  constructor(canvas: HTMLCanvasElement, sound: Phaser.Sound.BaseSoundManager) {
    const tracks = canvas.captureStream(FPS).getVideoTracks();
    if (sound instanceof Phaser.Sound.WebAudioSoundManager) {
      // Tap the master volume: the speakers keep playing, the clip gets a copy.
      const dest = sound.context.createMediaStreamDestination();
      sound.masterVolumeNode.connect(dest);
      tracks.push(...dest.stream.getAudioTracks());
      this.detachAudio = () => sound.masterVolumeNode.disconnect(dest);
    }
    const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    this.recorder = new MediaRecorder(new MediaStream(tracks), { mimeType, videoBitsPerSecond: VIDEO_BITS });
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.start(1000);
  }

  /**
   * Ends the recording and saves it as `name`: the dev server stores it in `media/clips/`,
   * elsewhere the browser downloads it. Resolves to where it went.
   */
  stop(name: string): Promise<string> {
    return new Promise((resolve) => {
      this.recorder.onstop = () => {
        this.detachAudio();
        const blob = new Blob(this.chunks, { type: 'video/webm' });
        resolve(import.meta.env.DEV ? upload(blob, name).catch(() => download(blob, name)) : download(blob, name));
      };
      this.recorder.stop();
    });
  }
}

async function upload(blob: Blob, name: string): Promise<string> {
  const res = await fetch(`/__clips/${encodeURIComponent(name)}`, { method: 'POST', body: blob });
  if (!res.ok) throw new Error(`clip upload: ${res.status}`);
  return ((await res.json()) as { file: string }).file;
}

function download(blob: Blob, name: string): string {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return `download: ${name}`;
}
