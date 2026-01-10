import { useFFTStore, type ColorScheme } from '../../store/fft';

const formatFreq = (hz: number) => `${(hz / 1e6).toFixed(3)} MHz`;
const formatBandwidth = (hz: number) => {
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(1)} MHz`;
  return `${(hz / 1e3).toFixed(0)} kHz`;
};

function RangeSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="flex items-center gap-3">
      <label className="text-xs text-slate-400 w-12 shrink-0">{label}</label>
      <div className="flex-1 relative h-6 flex items-center">
        <div className="absolute inset-x-0 h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="absolute inset-x-0 w-full h-6 opacity-0 cursor-pointer"
        />
        <div
          className="absolute w-3.5 h-3.5 bg-white rounded-full shadow-md border-2 border-blue-500 pointer-events-none transform -translate-x-1/2"
          style={{ left: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-slate-300 w-12 text-right font-mono tabular-nums">
        {Math.round(value)} dB
      </span>
    </div>
  );
}

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
    <div className="bg-slate-800/80 backdrop-blur-sm rounded-lg p-3 space-y-3">
      {/* Frequency Info */}
      {currentFFT && (
        <div className="flex items-center justify-between text-xs border-b border-slate-700/50 pb-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Center</span>
            <span className="text-slate-200 font-mono bg-slate-700/50 px-1.5 py-0.5 rounded">
              {formatFreq(currentFFT.centerFreq)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">BW</span>
            <span className="text-slate-200 font-mono bg-slate-700/50 px-1.5 py-0.5 rounded">
              {formatBandwidth(currentFFT.sampleRate)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">FFT</span>
            <span className="text-slate-200 font-mono bg-slate-700/50 px-1.5 py-0.5 rounded">
              {currentFFT.fftSize}
            </span>
          </div>
        </div>
      )}

      {/* dB Range */}
      <div className="space-y-2">
        <RangeSlider label="Min" value={minDb} min={-140} max={-40} onChange={setMinDb} />
        <RangeSlider label="Max" value={maxDb} min={-80} max={0} onChange={setMaxDb} />
      </div>

      {/* Color Scheme & View Toggles */}
      <div className="flex items-center gap-3 pt-1">
        <select
          value={colorScheme}
          onChange={(e) => setColorScheme(e.target.value as ColorScheme)}
          className="flex-1 bg-slate-700/70 text-slate-200 rounded-md px-2.5 py-1.5 text-xs border border-slate-600/50 focus:outline-none focus:border-blue-500/50 cursor-pointer"
        >
          <option value="viridis">Viridis</option>
          <option value="plasma">Plasma</option>
          <option value="classic">Classic SDR</option>
          <option value="grayscale">Grayscale</option>
        </select>

        <div className="flex rounded-md overflow-hidden border border-slate-600/50">
          <button
            onClick={toggleSpectrum}
            className={`px-3 py-1.5 text-xs font-medium transition-all ${
              showSpectrum
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700/70 text-slate-400 hover:text-slate-300'
            }`}
          >
            Spectrum
          </button>
          <button
            onClick={toggleWaterfall}
            className={`px-3 py-1.5 text-xs font-medium transition-all border-l border-slate-600/50 ${
              showWaterfall
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700/70 text-slate-400 hover:text-slate-300'
            }`}
          >
            Waterfall
          </button>
        </div>
      </div>
    </div>
  );
}
