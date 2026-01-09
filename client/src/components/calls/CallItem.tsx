import type { Call } from '../../types';
import { formatTimestamp, formatDuration, formatFrequency, getTagColor, classNames } from '../../utils/formatters';

interface CallItemProps {
  call: Call;
  isSelected: boolean;
  onClick: () => void;
}

export function CallItem({ call, isSelected, onClick }: CallItemProps) {
  const isActive = call.isActive;

  return (
    <div
      onClick={onClick}
      className={classNames(
        'p-3 border-b border-slate-700 cursor-pointer transition-colors',
        isSelected ? 'bg-slate-700' : 'hover:bg-slate-800',
        isActive && 'bg-green-900/20 border-l-2 border-l-green-500'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Talkgroup name */}
          <div className="flex items-center gap-2">
            {call.emergency && (
              <span className="px-1.5 py-0.5 bg-red-600 text-white text-xs font-bold rounded">
                EMERGENCY
              </span>
            )}
            {call.encrypted && (
              <span className="px-1.5 py-0.5 bg-yellow-600 text-black text-xs font-bold rounded">
                ENC
              </span>
            )}
            <span className="font-medium text-white truncate">
              {call.alpha_tag || `TG ${call.talkgroup_id}`}
            </span>
          </div>

          {/* Group and tag */}
          <div className="flex items-center gap-2 mt-1">
            {call.group_name && (
              <span className="text-xs text-slate-400 truncate">{call.group_name}</span>
            )}
            {call.group_tag && (
              <span
                className={classNames(
                  'px-1.5 py-0.5 text-xs rounded text-white',
                  getTagColor(call.group_tag)
                )}
              >
                {call.group_tag}
              </span>
            )}
          </div>

          {/* Frequency */}
          <div className="mt-1 text-xs text-slate-500 font-mono">
            {formatFrequency(call.frequency)}
          </div>
        </div>

        {/* Time and duration */}
        <div className="text-right">
          <div className="text-sm text-slate-300">{formatTimestamp(call.start_time)}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {isActive ? (
              <span className="text-green-400 animate-pulse">Active</span>
            ) : (
              formatDuration(call.duration)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
