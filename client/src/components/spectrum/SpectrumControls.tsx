import { useFFTStore, type ColorScheme } from '../../store/fft';

const formatFreq = (hz: number) => `${(hz / 1e6).toFixed(3)} MHz`;
const formatBandwidth = (hz: number) => {
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(1)} MHz`;
  return `${(hz / 1e3).toFixed(0)} kHz`;
};

export function SpectrumControls() {
  const {
    currentFFT,
    minDb,
    maxDb,
    setMinDb,
    setMaxDb,
    colorScheme,
    setColorScheme,
    showSpectrum,
    showWaterfall,
    toggleSpectrum,
    toggleWaterfall,
  } = useFFTStore();

  return (
    <div className="bg-slate-800 rounded-lg p-4 space-y-4">
      {/* Frequency Info */}
      {currentFFT && (
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-slate-500">Center:</span>
            <span className="ml-2 text-slate-200 font-mono">{formatFreq(currentFFT.centerFreq)}</span>
          </div>
          <div>
            <span className="text-slate-500">Bandwidth:</span>
            <span className="ml-2 text-slate-200 font-mono">{formatBandwidth(currentFFT.sampleRate)}</span>
          </div>
          <div>
            <span className="text-slate-500">FFT:</span>
            <span className="ml-2 text-slate-200 font-mono">{currentFFT.fftSize}</span>
          </div>
        </div>
      )}

      {/* dB Range */}
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <label className="text-sm text-slate-400 w-16">Min dB:</label>
          <input
            type="range"
            min="-140"
            max="-40"
            value={minDb}
            onChange={(e) => setMinDb(parseInt(e.target.value))}
            className="flex-1 accent-blue-500"
          />
          <span className="text-sm text-slate-300 w-16 text-right font-mono">{minDb}</span>
        </div>
        <div className="flex items-center gap-4">
          <label className="text-sm text-slate-400 w-16">Max dB:</label>
          <input
            type="range"
            min="-80"
            max="0"
            value={maxDb}
            onChange={(e) => setMaxDb(parseInt(e.target.value))}
            className="flex-1 accent-blue-500"
          />
          <span className="text-sm text-slate-300 w-16 text-right font-mono">{maxDb}</span>
        </div>
      </div>

      {/* Color Scheme & View Toggles */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <label className="text-sm text-slate-400 block mb-1">Color Scheme</label>
          <select
            value={colorScheme}
            onChange={(e) => setColorScheme(e.target.value as ColorScheme)}
            className="w-full bg-slate-700 text-slate-200 rounded px-3 py-1.5 text-sm"
          >
            <option value="viridis">Viridis</option>
            <option value="plasma">Plasma</option>
            <option value="classic">Classic SDR</option>
            <option value="grayscale">Grayscale</option>
          </select>
        </div>

        <div className="flex gap-2">
          <button
            onClick={toggleSpectrum}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              showSpectrum ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'
            }`}
          >
            Spectrum
          </button>
          <button
            onClick={toggleWaterfall}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              showWaterfall ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'
            }`}
          >
            Waterfall
          </button>
        </div>
      </div>
    </div>
  );
}
