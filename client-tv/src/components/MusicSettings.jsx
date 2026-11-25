import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { DEFAULT_MUSIC } from '../lib/defaultMusic';

const MUSIC_TYPES = [
  { key: 'QUESTION', label: 'Question', description: 'While a question is on screen', icon: '❓', color: '#818cf8' },
  { key: 'OPTIONS', label: 'Answer options', description: 'While options are shown', icon: '📝', color: '#38bdf8' },
  { key: 'ANSWER', label: 'Answer reveal', description: 'When the correct answer appears', icon: '✅', color: '#34d399' },
  { key: 'ROUND_RESULTS', label: 'Round results', description: 'During the round leaderboard', icon: '🏆', color: '#fbbf24' },
  { key: 'FINAL_RESULTS', label: 'Final results', description: 'During the winners screen', icon: '🎉', color: '#f472b6' }
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
    if (!confirm('Remove your track and go back to the built-in music for this stage?')) return;

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

  const playPreview = (type, url, once = false) => {
    if (playingTrack === type) {
      stopPreview();
      return;
    }

    stopPreview();
    audioRef.current = new Audio(url);
    audioRef.current.volume = 0.5;
    audioRef.current.loop = !once;
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

  const uploaded = MUSIC_TYPES.filter(({ key }) => getTrackForType(key)).length;

  return (
    <div className="ds-page narrow">
      <header className="ds-topbar">
        <Link to="/dashboard" className="ds-back" aria-label="Back">←</Link>
        <div className="ds-topbar-title">
          <small>Sound</small>
          <h1>Music</h1>
        </div>
        <div className="ds-topbar-actions">
          <span className={`ds-chip ${uploaded ? 'good' : ''}`}>{uploaded} of {MUSIC_TYPES.length} tracks</span>
        </div>
      </header>

      <p className="ds-dim" style={{ margin: '0 0 18px' }}>
        Every stage has original built-in music, so quizzes sound great out of the box. Upload your own track to replace any of them. Music plays on the big screen only, never on students’ phones.
      </p>

      {loading && <div style={{ display: 'grid', gap: 10 }}>{[0, 1, 2].map((k) => <div key={k} className="ds-skeleton" style={{ height: 76 }} />)}</div>}

      {!loading && (
        <div style={{ display: 'grid', gap: 10 }}>
          {MUSIC_TYPES.map(({ key, label, description, icon, color }) => {
            const track = getTrackForType(key);
            const isUploading = uploading === key;
            const isPlaying = playingTrack === key;
            return (
              <div key={key} className="ds-card ms-row" style={{ '--c': color }}>
                <span className="ds-tile">{icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ds-row" style={{ gap: 8 }}>
                    <h3 style={{ fontSize: 15.5 }}>{label}</h3>
                    {track ? <span className="ds-chip good">✓ Your track</span> : <span className="ds-chip accent">♪ Built-in</span>}
                  </div>
                  <p>{description}</p>
                </div>
                <div className="ds-row" style={{ gap: 6 }}>
                  {track ? (
                    <>
                      <button type="button" onClick={() => playPreview(key, track.url)} className={`ds-btn ds-btn-sm ${isPlaying ? 'ds-btn-primary' : ''}`}>
                        {isPlaying ? '⏸ Stop' : '▶ Play'}
                      </button>
                      <button type="button" onClick={() => fileInputRefs.current[key]?.click()} className="ds-btn ds-btn-sm" disabled={isUploading}>
                        {isUploading ? 'Uploading…' : 'Replace'}
                      </button>
                      <button type="button" onClick={() => handleDelete(track.id, key)} className="ds-btn ds-btn-sm ds-btn-ghost" title="Remove your track and use the built-in music">Use built-in</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => playPreview(key, DEFAULT_MUSIC[key], key === 'ANSWER')} className={`ds-btn ds-btn-sm ${isPlaying ? 'ds-btn-primary' : ''}`}>
                        {isPlaying ? '⏸ Stop' : '▶ Play'}
                      </button>
                      <button type="button" onClick={() => fileInputRefs.current[key]?.click()} disabled={isUploading} className="ds-btn ds-btn-sm">
                        {isUploading ? <><span className="ds-spinner" /> Uploading…</> : '⤴ Upload your own'}
                      </button>
                    </>
                  )}
                </div>
                <input ref={(el) => (fileInputRefs.current[key] = el)} type="file" accept="audio/mpeg,audio/mp3,audio/ogg,audio/wav"
                  style={{ display: 'none' }} onChange={(e) => handleFileSelect(key, e.target.files[0])} />
              </div>
            );
          })}
        </div>
      )}

      <div className="ds-alert info" style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span>💡</span><span>MP3, OGG or WAV · up to 10 MB per track · volume and mute are on the big screen during the quiz.</span>
      </div>
    </div>
  );
}

export default MusicSettings;
