import { useWebSocket } from './hooks/useWebSocket';
import { Header } from './components/layout/Header';
import { CallList } from './components/calls/CallList';
import { CallDetails } from './components/calls/CallDetails';
import { TalkgroupFilter } from './components/talkgroups/TalkgroupFilter';
import { LiveAudioPlayer } from './components/audio/LiveAudioPlayer';
import { AudioQueue } from './components/audio/AudioQueue';
import { SystemStatus } from './components/status/SystemStatus';
import { SystemBrowser } from './components/radioreference';
import { ControlChannelFeed } from './components/control';
import { SpectrumPanel } from './components/spectrum';
import { useCallsStore, useAudioStore } from './store';
import { useFFTStore } from './store/fft';
import { useEffect, useState } from 'react';
import { Routes, Route, useLocation, Link } from 'react-router-dom';

function LiveView() {
  const { selectedCall } = useCallsStore();
  const [activeTab, setActiveTab] = useState<'calls' | 'control'>('calls');

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left sidebar - Talkgroup filter */}
      <aside className="w-72 border-r border-slate-700 flex flex-col bg-slate-900">
        <TalkgroupFilter />
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col bg-slate-900">
        {/* Tab bar */}
        <div className="flex border-b border-slate-700 bg-slate-800/50">
          <button
            onClick={() => setActiveTab('calls')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'calls'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Calls
          </button>
          <button
            onClick={() => setActiveTab('control')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'control'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Control Channel
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'calls' ? <CallList /> : <ControlChannelFeed />}
        </div>
      </main>

      {/* Right sidebar - Call details */}
      {selectedCall && activeTab === 'calls' && (
        <aside className="w-80 border-l border-slate-700 flex flex-col bg-slate-900">
          <CallDetails />
        </aside>
      )}
    </div>
  );
}

function SpectrumView() {
  const { enableFFT } = useWebSocket();
  const { isEnabled } = useFFTStore();

  // Sync FFT streaming with server
  useEffect(() => {
    enableFFT(isEnabled);
  }, [isEnabled, enableFFT]);

  return (
    <div className="flex-1 overflow-auto p-4">
      <SpectrumPanel onEnableChange={(enabled) => enableFFT(enabled)} />
    </div>
  );
}

function App() {
  const { enableAudio, enableFFT } = useWebSocket();
  const { isLiveEnabled } = useAudioStore();
  const { isEnabled: isFFTEnabled } = useFFTStore();
  const location = useLocation();

  const isLivePage = location.pathname === '/' || location.pathname === '/live';
  const isBrowsePage = location.pathname.startsWith('/browse');
  const isSpectrumPage = location.pathname === '/spectrum';

  // Sync audio streaming with server
  useEffect(() => {
    enableAudio(isLiveEnabled);
  }, [isLiveEnabled, enableAudio]);

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      {/* Header with view toggle */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-slate-100">Radio Scanner</h1>
          {/* View toggle */}
          <div className="flex bg-slate-700 rounded-lg p-0.5">
            <Link
              to="/"
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                isLivePage
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Live Scanner
            </Link>
            <Link
              to="/spectrum"
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                isSpectrumPage
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Spectrum
            </Link>
            <Link
              to="/browse"
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                isBrowsePage
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Browse Systems
            </Link>
          </div>
        </div>
        <Header />
      </header>

      <Routes>
        <Route path="/" element={<LiveView />} />
        <Route path="/live" element={<LiveView />} />
        <Route path="/spectrum" element={<SpectrumView />} />
        <Route path="/browse" element={<SystemBrowser />} />
        <Route path="/browse/state/:stateId" element={<SystemBrowser />} />
        <Route path="/browse/state/:stateId/county/:countyId" element={<SystemBrowser />} />
        <Route path="/browse/system/:systemId" element={<SystemBrowser />} />
      </Routes>

      {/* Audio queue player (shows when live is enabled) */}
      <AudioQueue />

      <SystemStatus />

      {/* Live audio player (invisible, handles audio in background) */}
      <LiveAudioPlayer />
    </div>
  );
}

export default App;
