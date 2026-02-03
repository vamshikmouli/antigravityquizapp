/**
 * AudioManager - Centralized audio playback management for quiz music
 */
class AudioManager {
  constructor() {
    this.tracks = {
      QUESTION: null,
      OPTIONS: null,
      ANSWER: null,
      ROUND_RESULTS: null,
      FINAL_RESULTS: null
    };
    
    this.currentTrack = null;
    this.volume = 0.5;
    this.isMuted = false;
    this.isEnabled = true;
    this.isUnlocked = false; // Track if user has interacted to allow audio
  }

  /**
   * Attempt to unlock audio context/playback (call on user interaction)
   */
  unlock() {
    if (this.isUnlocked) return Promise.resolve();
    
    console.log('AudioManager: Attempting to unlock audio...');
    // Create a tiny silent buffer to play
    const silence = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==');
    return silence.play()
      .then(() => {
        console.log('AudioManager: Audio unlocked successfully');
        this.isUnlocked = true;
        return true;
      })
      .catch(err => {
        console.warn('AudioManager: Audio unlock failed:', err);
        return false;
      });
  }

  /**
   * Load music tracks from URLs
   * @param {Object} trackUrls - Object with track type keys and URL values
   */
  loadTracks(trackUrls) {
    if (!trackUrls) return;
    
    console.log('AudioManager: Loading tracks...', Object.keys(trackUrls));
    Object.keys(trackUrls).forEach(type => {
      if (trackUrls[type]) {
        try {
          const audio = new Audio(trackUrls[type]);
          audio.volume = this.volume;
          audio.loop = true; // Loop background music
          audio.preload = 'auto';
          this.tracks[type] = audio;
        } catch (e) {
          console.error(`AudioManager: Error loading track ${type}:`, e);
        }
      }
    });
  }

  /**
   * Play a specific track
   * @param {string} trackType - Type of track to play (QUESTION, OPTIONS, etc.)
   */
  play(trackType) {
    if (!this.isEnabled) return;
    
    console.log(`AudioManager: Request to play ${trackType}`);
    
    if (this.isMuted) {
      console.log('AudioManager: Audio is muted, skipping play');
      return;
    }

    // Stop current track if playing
    this.stop();

    const track = this.tracks[trackType];
    if (track) {
      track.currentTime = 0;
      track.volume = this.volume;
      
      const playPromise = track.play();
      
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn(`AudioManager: Autoplay blocked for ${trackType}:`, err);
          this.isUnlocked = false;
        });
      }
      this.currentTrack = track;
    } else {
      console.warn(`AudioManager: Track ${trackType} not found or not loaded`);
    }
  }

  /**
   * Stop the currently playing track
   */
  stop() {
    if (this.currentTrack) {
      this.currentTrack.pause();
      this.currentTrack.currentTime = 0;
      this.currentTrack = null;
    }
  }

  /**
   * Pause the currently playing track
   */
  pause() {
    if (this.currentTrack) {
      this.currentTrack.pause();
    }
  }

  /**
   * Resume the currently paused track
   */
  resume() {
    if (this.currentTrack && !this.isMuted && this.isEnabled) {
      this.currentTrack.play().catch(err => {
        console.warn('Failed to resume track:', err);
      });
    }
  }

  /**
   * Set volume for all tracks
   * @param {number} volume - Volume level (0.0 to 1.0)
   */
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    Object.values(this.tracks).forEach(track => {
      if (track) {
        track.volume = this.volume;
      }
    });
  }

  /**
   * Toggle mute
   */
  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.pause();
    } else {
      this.resume();
    }
    return this.isMuted;
  }

  /**
   * Set mute state
   * @param {boolean} muted - Mute state
   */
  setMute(muted) {
    this.isMuted = muted;
    if (this.isMuted) {
      this.pause();
    } else {
      this.resume();
    }
  }

  /**
   * Enable or disable music system
   * @param {boolean} enabled - Enable state
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    if (!enabled) {
      this.stop();
    }
  }

  /**
   * Get current state
   */
  getState() {
    return {
      volume: this.volume,
      isMuted: this.isMuted,
      isEnabled: this.isEnabled,
      isPlaying: this.currentTrack && !this.currentTrack.paused
    };
  }

  /**
   * Cleanup - stop all tracks and release resources
   */
  cleanup() {
    this.stop();
    Object.values(this.tracks).forEach(track => {
      if (track) {
        track.pause();
        track.src = '';
      }
    });
    this.tracks = {};
  }
}

export default AudioManager;
