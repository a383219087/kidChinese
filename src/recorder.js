export class VoiceRecorder {
  constructor() {
    this.mediaRecorder = null
    this.chunks = []
    this.stream = null
    this.recording = false
  }

  async start() {
    if (this.recording) return
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mime = MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : ''
    this.mediaRecorder = mime
      ? new MediaRecorder(this.stream, { mimeType: mime })
      : new MediaRecorder(this.stream)
    this.chunks = []
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data)
    }
    this.mediaRecorder.start()
    this.recording = true
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || !this.recording) {
        resolve(null)
        return
      }
      this.mediaRecorder.onstop = () => {
        const type = this.mediaRecorder.mimeType || 'audio/webm'
        const blob = this.chunks.length ? new Blob(this.chunks, { type }) : null
        this.cleanup()
        resolve(blob)
      }
      this.mediaRecorder.stop()
      this.recording = false
    })
  }

  cleanup() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop())
      this.stream = null
    }
    this.mediaRecorder = null
    this.chunks = []
    this.recording = false
  }
}
