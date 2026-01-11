import { useEffect, useState } from 'react';
import { useSystemStore } from '../../store';

const systemTypes = [
  { value: 'p25', label: 'P25 Trunked', description: 'Standard trunked P25 system with control channel' },
  { value: 'conventional', label: 'Conventional', description: 'Fixed frequency channels (LAPD, etc.)' },
] as const;

export function SystemConfigPanel() {
  const { systemConfig, isConventional, fetchSystemConfig, updateSystemConfig, error, clearError } = useSystemStore();
  const [selectedType, setSelectedType] = useState<string>('p25');
  const [shortName, setShortName] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetchSystemConfig();
  }, [fetchSystemConfig]);

  useEffect(() => {
    if (systemConfig) {
      setSelectedType(systemConfig.type);
      setShortName(systemConfig.shortName);
    }
  }, [systemConfig]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    clearError();

    const success = await updateSystemConfig({
      type: selectedType,
      shortName: shortName || 'default',
    });

    setIsSaving(false);
    if (success) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  const hasChanges = systemConfig && (
    selectedType !== systemConfig.type ||
    shortName !== systemConfig.shortName
  );

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-white mb-4">System Configuration</h3>

      <div className="space-y-4">
        {/* System Type Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            System Type
          </label>
          <div className="space-y-2">
            {systemTypes.map((type) => (
              <label
                key={type.value}
                className={`flex items-start p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedType === type.value
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <input
                  type="radio"
                  name="systemType"
                  value={type.value}
                  checked={selectedType === type.value}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="mt-1 h-4 w-4 text-blue-500 border-gray-500 focus:ring-blue-500"
                />
                <div className="ml-3">
                  <span className="block text-sm font-medium text-white">
                    {type.label}
                  </span>
                  <span className="block text-xs text-gray-400">
                    {type.description}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* System Name */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            System Name
          </label>
          <input
            type="text"
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            placeholder="e.g., LAPD, San Francisco"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Current Status */}
        <div className="p-3 bg-gray-700/50 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Current Mode:</span>
            <span className={`text-sm font-medium ${isConventional ? 'text-yellow-400' : 'text-green-400'}`}>
              {isConventional ? 'Conventional' : 'Trunked P25'}
            </span>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {saveSuccess && (
          <div className="p-3 bg-green-500/20 border border-green-500/50 rounded-lg">
            <p className="text-sm text-green-400">Configuration saved successfully!</p>
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
            hasChanges && !isSaving
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-600 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isSaving ? 'Saving...' : hasChanges ? 'Save Changes' : 'No Changes'}
        </button>

        {/* Info Box */}
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-xs text-blue-300">
            <strong>Tip:</strong> Changes take effect immediately. For conventional systems like LAPD,
            calls will be identified by frequency instead of talkgroup.
          </p>
        </div>
      </div>
    </div>
  );
}
