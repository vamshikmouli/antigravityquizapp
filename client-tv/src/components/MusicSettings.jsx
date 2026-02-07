import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import './QuestionManager.css';

const MUSIC_TYPES = [
  { key: 'QUESTION', label: 'Question Music', description: 'Plays when a question is displayed', icon: '❓' },
  { key: 'OPTIONS', label: 'Options Music', description: 'Plays when showing answer options', icon: '📝' },
  { key: 'ANSWER', label: 'Answer Music', description: 'Plays when revealing the correct answer', icon: '✅' },
  { key: 'ROUND_RESULTS', label: 'Round Results Music', description: 'Plays during round leaderboard', icon: '🏆' },
  { key: 'FINAL_RESULTS', label: 'Final Results Music', description: 'Plays during final results', icon: '🎉' }
];

function MusicSettings() {
  const { token } = useAuth();
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null);
  const [playingTrack, setPlayingTrack] = useState(null);
  const audioRef = useRef(null);
  const fileInputRefs = useRef({});

  useEffect(() => {
    fetchTracks();
  }, []);

  const fetchTracks = async () => {
    try {
      const res = await fetch('/api/music', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setTracks(data);
    } catch (err) {
      console.error('Error fetching tracks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (type, file) => {
    if (!file) return;

    // Validate file type
    const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav'];
    if (!validTypes.includes(file.type)) {
      alert('Please upload an audio file (MP3, OGG, or WAV)');
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }

    setUploading(type);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    try {
      const res = await fetch('/api/music/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (res.ok) {
        await fetchTracks();
        alert('Music uploaded successfully!');
      } else {
        const error = await res.json();
        alert(error.error || 'Upload failed');
      }
    } catch (err) {
      console.error('Upload error:', err);
      alert('Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async (trackId, type) => {
    if (!confirm('Are you sure you want to delete this music track?')) return;

    try {
      const res = await fetch(`/api/music/${trackId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        await fetchTracks();
        if (playingTrack === type) {
          stopPreview();
        }
      } else {
        alert('Delete failed');
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Delete failed');
    }
  };

  const playPreview = (type, url) => {
    if (playingTrack === type) {
      stopPreview();
      return;
    }

    stopPreview();
    audioRef.current = new Audio(url);
    audioRef.current.volume = 0.5;
    audioRef.current.play();
    setPlayingTrack(type);

    audioRef.current.onended = () => {
      setPlayingTrack(null);
    };
  };

  const stopPreview = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingTrack(null);
  };

  const getTrackForType = (type) => {
    return tracks.find(t => t.type === type);
  };

  return (
    <div className="dashboard-container fade-in">
      <header className="dashboard-header">
        <div className="header-info" style={{ display: 'flex', alignItems: 'center' }}>
          <Link to="/dashboard" className="top-left-back-btn">← Back</Link>
          <h1>🎵 Music Settings</h1>
        </div>
      </header>

      <div className="content-section">
        <p style={{ marginBottom: '30px', opacity: 0.8 }}>
          Upload custom background music for different stages of your quiz. Music will play on the TV display only.
        </p>

        <div style={{ display: 'grid', gap: '24px' }}>
          {MUSIC_TYPES.map(({ key, label, description, icon }) => {
            const track = getTrackForType(key);
            const isUploading = uploading === key;
            const isPlaying = playingTrack === key;

            return (
              <div
                key={key}
                className="card-glass"
                style={{
                  padding: '24px',
                  borderRadius: '20px',
                  border: track ? '2px solid var(--color-success)' : '1px solid var(--color-border)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
                  <div style={{ fontSize: '48px' }}>{icon}</div>
                  
                  <div style={{ flex: 1 }}>
                    <h3 style={{ marginBottom: '8px' }}>{label}</h3>
                    <p style={{ opacity: 0.7, marginBottom: '16px' }}>{description}</p>

                    {track ? (
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ 
                          padding: '6px 12px', 
                          background: 'rgba(16, 185, 129, 0.1)', 
                          borderRadius: '8px',
                          color: 'var(--color-success)',
                          fontSize: '14px'
                        }}>
                          ✓ Uploaded
                        </span>
                        
                        <button
                          onClick={() => playPreview(key, track.url)}
                          className="secondary-btn"
                          style={{ padding: '8px 16px', fontSize: '14px' }}
                        >
                          {isPlaying ? '⏸️ Stop' : '▶️ Preview'}
                        </button>

                        <button
                          onClick={() => fileInputRefs.current[key]?.click()}
                          className="secondary-btn"
                          style={{ padding: '8px 16px', fontSize: '14px' }}
                        >
                          🔄 Replace
                        </button>

                        <button
                          onClick={() => handleDelete(track.id, key)}
                          className="secondary-btn"
                          style={{ 
                            padding: '8px 16px', 
                            fontSize: '14px',
                            background: 'rgba(244, 63, 94, 0.1)',
                            color: 'var(--color-error)'
                          }}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => fileInputRefs.current[key]?.click()}
                        disabled={isUploading}
                        className="primary-btn"
                        style={{ 
                          padding: '12px 24px',
                          background: isUploading ? '#555' : 'var(--grad-primary)'
                        }}
                      >
                        {isUploading ? '⏳ Uploading...' : '📤 Upload Music'}
                      </button>
                    )}

                    <input
                      ref={el => fileInputRefs.current[key] = el}
                      type="file"
                      accept="audio/mpeg,audio/mp3,audio/ogg,audio/wav"
                      style={{ display: 'none' }}
                      onChange={(e) => handleFileSelect(key, e.target.files[0])}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div 
          className="card-glass" 
          style={{ 
            marginTop: '40px', 
            padding: '20px', 
            borderRadius: '16px',
            background: 'rgba(99, 102, 241, 0.05)'
          }}
        >
          <h4 style={{ marginBottom: '12px' }}>💡 Tips</h4>
          <ul style={{ paddingLeft: '20px', opacity: 0.8, lineHeight: '1.8' }}>
            <li>Supported formats: MP3, OGG, WAV</li>
            <li>Maximum file size: 10MB per track</li>
            <li>Music will loop automatically during each stage</li>
            <li>You can control volume and mute during the quiz</li>
            <li>Music plays only on the TV display, not on student devices</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default MusicSettings;
