import React, { useState, useEffect } from 'react';
import './MusicControls.css';
import Icon from './common/Icon';

// inline: sits in the page flow (e.g. under the TV leaderboard) instead of floating.
const MusicControls = ({ audioManager, sessionData, inline = false }) => {
  const [isMuted, setIsMuted] = useState(audioManager?.isMuted || false);
  const [volume, setVolume] = useState(Math.round((audioManager?.volume || 0.5) * 100));

  const [position, setPosition] = useState({ x: 20, y: window.innerHeight - 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Sync state if audioManager changes externally
  useEffect(() => {
    if (audioManager) {
      setIsMuted(audioManager.isMuted);
      setVolume(Math.round(audioManager.volume * 100));
    }
  }, [audioManager, audioManager?.isMuted, audioManager?.volume]);

  // Handle Dragging
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      
      // Boundary checks
      const maxX = window.innerWidth - 200; // rough width
      const maxY = window.innerHeight - 60; // rough height
      
      setPosition({
        x: Math.min(Math.max(0, newX), maxX),
        y: Math.min(Math.max(0, newY), maxY)
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const handleMouseDown = (e) => {
    // Prevent drag when interacting with slider
    if (e.target.type === 'range') return;
    
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

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
    <div 
      className={`global-music-controls card-glass fade-in ${inline ? 'inline' : ''} ${isDragging ? 'dragging' : ''}`}
      style={inline ? undefined : {
        left: `${position.x}px`,
        top: `${position.y}px`,
        position: 'fixed',
        bottom: 'auto',
        right: 'auto'
      }}
      onMouseDown={inline ? undefined : handleMouseDown}
    >
      {inline
        ? <span className="music-inline-label"><Icon name="music" /> Music</span>
        : <div className="drag-handle" title="Drag to move"><Icon name="grip" /></div>}
      <button 
        className="music-btn" 
        onClick={handleToggleMute}
        title={isMuted ? "Unmute" : "Mute"}
        aria-label={isMuted ? "Unmute music" : "Mute music"}
      >
        <Icon name={isMuted ? 'mute' : 'volume'} />
      </button>
      <div className="volume-slider-container">
        <input 
          type="range" 
          min="0" 
          max="100" 
          value={volume} 
          onChange={handleVolumeChange}
          className="global-volume-slider"
          aria-label="Music volume"
          style={{ '--v': `${volume}%` }}
        />
        <span className="volume-label">{volume}%</span>
      </div>
    </div>
  );
};

export default MusicControls;
