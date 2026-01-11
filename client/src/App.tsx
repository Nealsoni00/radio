import { useWebSocket, usePersistentSize } from './hooks';
import { Header, ResizeHandle } from './components/layout';
import { CallList, CallDetails } from './components/calls';
import { TalkgroupFilter } from './components/talkgroups';
import { FloatingAudioPlayer } from './components/audio';
import { SystemStatus } from './components/status';
import { SystemBrowser } from './components/radioreference';
import { ControlChannelFeed } from './components/control';
import { SpectrumPanel } from './components/spectrum';
import { useCallsStore, useAudioStore } from './store';
import { useFFTStore } from './store/fft';
import { PANEL_SIZES, STORAGE_KEYS } from './constants';
import { useEffect, useState } from 'react';
import { Routes, Route, useLocation, Link } from 'react-router-dom';

function LiveView() {
  const { selectedCall } = useCallsStore();
  const [isControlPanelCollapsed, setIsControlPanelCollapsed] = useState(false);

  // Resizable panel sizes with localStorage persistence
  const [sidebarWidth, updateSidebarWidth] = usePersistentSize(
    STORAGE_KEYS.TALKGROUPS_SIDEBAR,
    PANEL_SIZES.SIDEBAR_DEFAULT,
    PANEL_SIZES.SIDEBAR_MIN,
    PANEL_SIZES.SIDEBAR_MAX
  );
  const [controlPanelHeight, updateControlPanelHeight] = usePersistentSize(
    STORAGE_KEYS.CONTROL_PANEL,
    PANEL_SIZES.CONTROL_PANEL_DEFAULT,
    PANEL_SIZES.CONTROL_PANEL_MIN,
    PANEL_SIZES.CONTROL_PANEL_MAX
  );
  const [detailsWidth, updateDetailsWidth] = usePersistentSize(
    STORAGE_KEYS.CALL_DETAILS,
    PANEL_SIZES.DETAILS_DEFAULT,
    PANEL_SIZES.DETAILS_MIN,
    PANEL_SIZES.DETAILS_MAX
  );

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left sidebar - Talkgroup filter (resizable) */}
      <aside
        className="border-r border-slate-700 flex flex-col bg-slate-900 flex-shrink-0"
        style={{ width: sidebarWidth }}
      >
        <TalkgroupFilter />
      </aside>

      {/* Resize handle for sidebar */}
      <ResizeHandle
        direction="horizontal"
        onDrag={(delta) => updateSidebarWidth(delta)}
      />

      {/* Main content - split view with calls and control channel */}
      <main className="flex-1 flex flex-col bg-slate-900 min-w-0">
        {/* Calls section */}
        <div className="flex-1 overflow-hidden min-h-0">
          <CallList />
        </div>

        {/* Resize handle for control panel (only when not collapsed) */}
        {!isControlPanelCollapsed && (
          <ResizeHandle
            direction="vertical"
            onDrag={(delta) => updateControlPanelHeight(-delta)}
          />
        )}

        {/* Control Channel Panel - collapsible and resizable bottom section */}
        <div
          className="border-t border-slate-700 flex flex-col bg-slate-900 flex-shrink-0"
          style={{ height: isControlPanelCollapsed ? 'auto' : controlPanelHeight }}
        >
          {/* Panel header with toggle */}
          <div
            className="px-3 py-1.5 border-b border-slate-700 bg-slate-800 flex items-center justify-between cursor-pointer select-none"
            onClick={() => setIsControlPanelCollapsed(!isControlPanelCollapsed)}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">
                {isControlPanelCollapsed ? '▶' : '▼'}
              </span>
              <span className="text-sm font-medium text-slate-300">Control Channel</span>
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="Live"></span>
            </div>
            <span className="text-xs text-slate-500">
              {isControlPanelCollapsed ? 'Click to expand' : 'Drag top edge to resize'}
            </span>
          </div>

          {/* Panel content */}
          {!isControlPanelCollapsed && (
            <div className="flex-1 overflow-hidden">
              <ControlChannelFeed compact />
            </div>
          )}
        </div>
      </main>

      {/* Right sidebar - Call details (resizable) */}
      {selectedCall && (
        <>
          {/* Resize handle for details panel */}
          <ResizeHandle
            direction="horizontal"
            onDrag={(delta) => updateDetailsWidth(-delta)}
          />

          <aside
            className="border-l border-slate-700 flex flex-col bg-slate-900 flex-shrink-0"
            style={{ width: detailsWidth }}
          >
            <CallDetails />
          </aside>
        </>
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
  const { enableAudio } = useWebSocket();
  const { isLiveEnabled } = useAudioStore();
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

      {/* Floating audio player (shows when live is enabled) */}
      <FloatingAudioPlayer />

      <SystemStatus />
    </div>
  );
}

export default App;
