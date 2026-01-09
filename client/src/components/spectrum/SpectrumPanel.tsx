import { useFFTStore } from '../../store/fft';
import { SpectrumDisplay } from './SpectrumDisplay';
import { WaterfallDisplay } from './WaterfallDisplay';
import { SpectrumControls } from './SpectrumControls';

interface SpectrumPanelProps {
  onEnableChange?: (enabled: boolean) => void;
}

export function SpectrumPanel({ onEnableChange }: SpectrumPanelProps) {
  const { isEnabled, showSpectrum, showWaterfall, setEnabled, currentFFT, clearHistory } =
    useFFTStore();

  const handleToggle = () => {
    const newEnabled = !isEnabled;
    setEnabled(newEnabled);
    if (!newEnabled) {
      clearHistory();
    }
    onEnableChange?.(newEnabled);
  };

  return (
    <div className="bg-slate-900 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">Spectrum Analyzer</h2>
          {currentFFT && (
            <p className="text-sm text-slate-500">
              {(currentFFT.minFreq / 1e6).toFixed(2)} - {(currentFFT.maxFreq / 1e6).toFixed(2)} MHz
            </p>
          )}
        </div>
        <button
          onClick={handleToggle}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            isEnabled
              ? 'bg-red-600 hover:bg-red-500 text-white'
              : 'bg-green-600 hover:bg-green-500 text-white'
          }`}
        >
          {isEnabled ? 'Stop' : 'Start'}
        </button>
      </div>

      {isEnabled ? (
        <>
          {showSpectrum && (
            <div>
              <h3 className="text-sm font-medium text-slate-400 mb-2">Spectrum</h3>
              <SpectrumDisplay height={180} />
            </div>
          )}
          {showWaterfall && (
            <div>
              <h3 className="text-sm font-medium text-slate-400 mb-2">Waterfall</h3>
              <WaterfallDisplay height={200} />
            </div>
          )}
          <SpectrumControls />
        </>
      ) : (
        <div className="h-[400px] flex items-center justify-center text-slate-500 bg-slate-800/50 rounded-lg">
          <div className="text-center">
            <div className="text-4xl mb-2">📡</div>
            <p>Click Start to view real-time spectrum</p>
            <p className="text-sm text-slate-600 mt-1">
              Requires trunk-recorder with fftstream plugin
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
