import { ClientMessage, VoicePeerState } from '../types/uno.js';

interface VoiceEvents {
  onPeersChange: (peers: Record<string, VoicePeerState>) => void;
  onLocalStateChange: (state: { isJoined: boolean; isMuted: boolean; isDeafened: boolean; isSpeaking: boolean }) => void;
  onError: (errorMsg: string) => void;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export class VoiceChatService {
  private localStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private remoteAudioElements: Map<string, HTMLAudioElement> = new Map();
  private peerStates: Record<string, VoicePeerState> = {};
  
  private roomId: string | null = null;
  private myPlayerId: string | null = null;
  private sendSocketMessage: ((msg: ClientMessage) => void) | null = null;
  
  private isJoined: boolean = false;
  private isMuted: boolean = false;
  private isDeafened: boolean = false;
  private isSpeaking: boolean = false;

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;
  private speakingThreshold = 18; // volume sensitivity
  private events: VoiceEvents | null = null;

  public setEvents(events: VoiceEvents) {
    this.events = events;
  }

  public getIsJoined(): boolean {
    return this.isJoined;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getIsDeafened(): boolean {
    return this.isDeafened;
  }

  public getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  public getPeerStates(): Record<string, VoicePeerState> {
    return this.peerStates;
  }

  public async joinVoice(
    roomId: string,
    myPlayerId: string,
    activePlayers: Array<{ id: string; isBot?: boolean }>,
    sendMessage: (msg: ClientMessage) => void
  ): Promise<boolean> {
    if (this.isJoined) return true;

    this.roomId = roomId;
    this.myPlayerId = myPlayerId;
    this.sendSocketMessage = sendMessage;

    if (!window.isSecureContext || !navigator?.mediaDevices?.getUserMedia) {
      const msg = 'Navegadores exigem conexão segura (HTTPS) para liberar o microfone. Em HTTP (IP direto), o microfone é bloqueado pelo próprio navegador.';
      this.events?.onError(msg);
      return false;
    }

    try {
      // Request microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      this.localStream = stream;
      this.isJoined = true;
      this.isMuted = false;
      this.isDeafened = false;

      // Setup audio analysis for speech detection
      this.setupAudioAnalyser(stream);

      // Notify room about joining voice
      this.broadcastLocalState();

      // Connect to existing human peers
      for (const p of activePlayers) {
        if (p.id !== myPlayerId && !p.isBot) {
          this.initiateCallTo(p.id);
        }
      }

      this.notifyLocalState();
      return true;
    } catch (err: any) {
      console.error('Error accessing microphone:', err);
      let msg = 'Não foi possível acessar o microfone.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Permissão de microfone negada. Autorize o microfone no navegador para falar.';
      } else if (err.name === 'NotFoundError') {
        msg = 'Nenhum microfone encontrado neste dispositivo.';
      }
      this.events?.onError(msg);
      return false;
    }
  }

  public leaveVoice() {
    if (!this.isJoined) return;

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (e) {}
      this.audioContext = null;
    }

    // Stop local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    // Close all peer connections
    for (const [peerId, pc] of this.peerConnections.entries()) {
      try {
        pc.close();
      } catch (e) {}
    }
    this.peerConnections.clear();

    // Remove remote audio elements
    for (const [peerId, audio] of this.remoteAudioElements.entries()) {
      try {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      } catch (e) {}
    }
    this.remoteAudioElements.clear();

    this.isJoined = false;
    this.isSpeaking = false;
    this.isMuted = false;
    this.isDeafened = false;

    // Broadcast leave
    if (this.roomId && this.myPlayerId && this.sendSocketMessage) {
      this.sendSocketMessage({
        type: 'rtc_voice_state',
        roomId: this.roomId,
        playerId: this.myPlayerId,
        isMuted: true,
        isDeafened: true,
        isSpeaking: false,
        joined: false,
      });
    }

    this.notifyLocalState();
  }

  public toggleMute(): boolean {
    return this.setMuted(!this.isMuted);
  }

  public setMuted(muted: boolean): boolean {
    this.isMuted = muted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
    if (muted) {
      this.isSpeaking = false;
    }
    this.broadcastLocalState();
    this.notifyLocalState();
    return this.isMuted;
  }

  public toggleDeafen(): boolean {
    return this.setDeafened(!this.isDeafened);
  }

  public setDeafened(deafened: boolean): boolean {
    this.isDeafened = deafened;
    
    // When deafened, mute own mic too
    if (deafened && !this.isMuted) {
      this.setMuted(true);
    }

    // Mute all remote audio elements
    for (const audio of this.remoteAudioElements.values()) {
      audio.muted = deafened;
    }

    this.broadcastLocalState();
    this.notifyLocalState();
    return this.isDeafened;
  }

  public handleRemoteVoiceState(
    playerId: string,
    isMuted: boolean,
    isDeafened: boolean,
    isSpeaking: boolean,
    joined: boolean
  ) {
    if (joined) {
      this.peerStates[playerId] = {
        playerId,
        isMuted,
        isDeafened,
        isSpeaking,
        joined,
      };

      // If we are in voice and don't have a peer connection yet, connect!
      if (this.isJoined && this.myPlayerId && playerId !== this.myPlayerId && !this.peerConnections.has(playerId)) {
        this.initiateCallTo(playerId);
      }
    } else {
      delete this.peerStates[playerId];
      const pc = this.peerConnections.get(playerId);
      if (pc) {
        pc.close();
        this.peerConnections.delete(playerId);
      }
      const audio = this.remoteAudioElements.get(playerId);
      if (audio) {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
        this.remoteAudioElements.delete(playerId);
      }
    }

    this.events?.onPeersChange({ ...this.peerStates });
  }

  // WebRTC Mesh Connection Logic
  private createPeerConnection(targetPlayerId: string): RTCPeerConnection {
    const existing = this.peerConnections.get(targetPlayerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peerConnections.set(targetPlayerId, pc);

    // Add local mic tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // Send ICE candidates to peer
    pc.onicecandidate = (event) => {
      if (event.candidate && this.roomId && this.myPlayerId && this.sendSocketMessage) {
        this.sendSocketMessage({
          type: 'rtc_ice_candidate',
          roomId: this.roomId,
          fromPlayerId: this.myPlayerId,
          toPlayerId: targetPlayerId,
          candidate: event.candidate,
        });
      }
    };

    // Receive audio stream from peer
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (!remoteStream) return;

      let audio = this.remoteAudioElements.get(targetPlayerId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        audio.muted = this.isDeafened;
        this.remoteAudioElements.set(targetPlayerId, audio);
      }
      audio.srcObject = remoteStream;
      audio.play().catch((e) => console.warn('Autoplay audio interaction needed:', e));
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.peerConnections.delete(targetPlayerId);
      }
    };

    return pc;
  }

  private async initiateCallTo(targetPlayerId: string) {
    if (!this.roomId || !this.myPlayerId || !this.sendSocketMessage) return;

    try {
      const pc = this.createPeerConnection(targetPlayerId);
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(offer);

      this.sendSocketMessage({
        type: 'rtc_offer',
        roomId: this.roomId,
        fromPlayerId: this.myPlayerId,
        toPlayerId: targetPlayerId,
        offer: pc.localDescription,
      });
    } catch (err) {
      console.error('Error creating offer for peer:', targetPlayerId, err);
    }
  }

  public async handleOffer(fromPlayerId: string, offer: RTCSessionDescriptionInit) {
    if (!this.isJoined || !this.roomId || !this.myPlayerId || !this.sendSocketMessage) return;

    try {
      const pc = this.createPeerConnection(fromPlayerId);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.sendSocketMessage({
        type: 'rtc_answer',
        roomId: this.roomId,
        fromPlayerId: this.myPlayerId,
        toPlayerId: fromPlayerId,
        answer: pc.localDescription,
      });
    } catch (err) {
      console.error('Error handling offer from peer:', fromPlayerId, err);
    }
  }

  public async handleAnswer(fromPlayerId: string, answer: RTCSessionDescriptionInit) {
    const pc = this.peerConnections.get(fromPlayerId);
    if (!pc) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.error('Error handling answer from peer:', fromPlayerId, err);
    }
  }

  public async handleIceCandidate(fromPlayerId: string, candidate: RTCIceCandidateInit) {
    const pc = this.peerConnections.get(fromPlayerId);
    if (!pc) return;

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('Error adding ICE candidate:', err);
    }
  }

  // Audio Analyser for Speaking Detection
  private setupAudioAnalyser(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        if (!this.isJoined || !this.analyser) return;

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const nowSpeaking = avg > this.speakingThreshold && !this.isMuted;

        if (nowSpeaking !== this.isSpeaking) {
          this.isSpeaking = nowSpeaking;
          this.broadcastLocalState();
          this.notifyLocalState();
        }

        this.animFrameId = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (err) {
      console.warn('Could not setup audio analyser:', err);
    }
  }

  private broadcastLocalState() {
    if (this.roomId && this.myPlayerId && this.sendSocketMessage) {
      this.sendSocketMessage({
        type: 'rtc_voice_state',
        roomId: this.roomId,
        playerId: this.myPlayerId,
        isMuted: this.isMuted,
        isDeafened: this.isDeafened,
        isSpeaking: this.isSpeaking,
        joined: this.isJoined,
      });
    }
  }

  private notifyLocalState() {
    this.events?.onLocalStateChange({
      isJoined: this.isJoined,
      isMuted: this.isMuted,
      isDeafened: this.isDeafened,
      isSpeaking: this.isSpeaking,
    });
  }
}

export const voiceChat = new VoiceChatService();
