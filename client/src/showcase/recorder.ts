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

  /** Ends the recording and downloads it as `name`. */
  stop(name: string): Promise<void> {
    return new Promise((resolve) => {
      this.recorder.onstop = () => {
        this.detachAudio();
        const url = URL.createObjectURL(new Blob(this.chunks, { type: 'video/webm' }));
        const a = Object.assign(document.createElement('a'), { href: url, download: name });
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        resolve();
      };
      this.recorder.stop();
    });
  }
}
