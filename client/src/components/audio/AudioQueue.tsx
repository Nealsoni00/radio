import { useEffect, useRef } from 'react';
import { useAudioStore } from '../../store';

export function AudioQueue() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const {
    isLiveEnabled,
    volume,
    audioQueue,
    currentAudio,
    playNext,
    setCurrentAudio,
    setPlaying,
    setCurrentTalkgroup,
  } = useAudioStore();

  // Auto-play next in queue when current finishes or when queue gets items
  useEffect(() => {
    if (!isLiveEnabled) return;

    // If nothing is playing and queue has items, start playing
    if (!currentAudio && audioQueue.length > 0) {
      playNext();
    }
  }, [isLiveEnabled, currentAudio, audioQueue.length, playNext]);

  // Play current audio when it changes
  useEffect(() => {
    if (currentAudio && audioRef.current) {
      audioRef.current.src = currentAudio.audioUrl;
      audioRef.current.volume = volume;
      audioRef.current.play().catch((err) => {
        console.error('Failed to play audio:', err);
        // Try next in queue
        playNext();
      });
      setCurrentTalkgroup(currentAudio.talkgroupId);
      setPlaying(true);
    }
  }, [currentAudio, volume, setCurrentTalkgroup, setPlaying, playNext]);

  // Update volume when it changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const handleEnded = () => {
    setPlaying(false);
    setCurrentAudio(null);
    // playNext will be triggered by the useEffect above
  };

  const handleError = () => {
    console.error('Audio playback error');
    setPlaying(false);
    setCurrentAudio(null);
  };

  if (!isLiveEnabled) return null;

  return (
    <div className="fixed bottom-16 left-0 right-0 bg-slate-900 border-t border-slate-700 px-4 py-2">
      <div className="flex items-center justify-between max-w-screen-xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${currentAudio ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`} />
            <span className="text-sm text-slate-300">
              {currentAudio ? (
                <>
                  Playing: <span className="text-white font-medium">{currentAudio.alphaTag || `TG ${currentAudio.talkgroupId}`}</span>
                </>
              ) : (
                'Waiting for audio...'
              )}
            </span>
          </div>
          {audioQueue.length > 0 && (
            <span className="text-xs text-slate-500">
              ({audioQueue.length} queued)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Vol</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={(e) => useAudioStore.getState().setVolume(parseFloat(e.target.value))}
            className="w-20 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>

      <audio
        ref={audioRef}
        onEnded={handleEnded}
        onError={handleError}
        className="hidden"
      />
    </div>
  );
}
