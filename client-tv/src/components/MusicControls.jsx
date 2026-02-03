import React, { useState, useEffect } from 'react';
import './MusicControls.css';

const MusicControls = ({ audioManager, sessionData }) => {
  const [isMuted, setIsMuted] = useState(audioManager?.isMuted || false);
  const [volume, setVolume] = useState(Math.round((audioManager?.volume || 0.5) * 100));

  // Sync state if audioManager changes externally
  useEffect(() => {
    if (audioManager) {
      setIsMuted(audioManager.isMuted);
      setVolume(Math.round(audioManager.volume * 100));
    }
  }, [audioManager, audioManager?.isMuted, audioManager?.volume]);

  if (!sessionData || !sessionData.musicEnabled) return null;

  const handleToggleMute = () => {
    if (audioManager) {
      const newMuted = audioManager.toggleMute();
      setIsMuted(newMuted);
    }
  };

  const handleVolumeChange = (e) => {
    const newVol = parseInt(e.target.value);
    setVolume(newVol);
    if (audioManager) {
      audioManager.setVolume(newVol / 100);
    }
  };

  return (
    <div className="global-music-controls card-glass fade-in">
      <button 
        className="music-btn" 
        onClick={handleToggleMute}
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? '🔇' : '🔊'}
      </button>
      <div className="volume-slider-container">
        <input 
          type="range" 
          min="0" 
          max="100" 
          value={volume} 
          onChange={handleVolumeChange}
          className="global-volume-slider"
        />
        <span className="volume-label">{volume}%</span>
      </div>
    </div>
  );
};

export default MusicControls;
