import { useUIStore } from '../../store/uiStore';
import { useHistoryStore } from '../../store/historyStore';
import { useHoladStore } from '../../store/holadStore';
import { AlertTriangle, Server, Trash2 } from 'lucide-react';

export default function SyncConflictModal() {
  const pendingHistorySync = useUIStore(s => s.pendingHistorySync);
  const setPendingHistorySync = useUIStore(s => s.setPendingHistorySync);

  if (!pendingHistorySync) return null;

  const handleRestore = () => {
    useHistoryStore.getState().syncHistoryData(pendingHistorySync);
    setPendingHistorySync(null);
  };

  const handleWipe = () => {
    useHistoryStore.getState().clearHistory();
    useHoladStore.getState().sendRemoteCommand('clearHistory', {});
    setPendingHistorySync(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-4 mb-4 text-orange-400">
          <div className="p-3 bg-orange-400/10 rounded-full">
            <AlertTriangle size={32} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Синхронизация Истории</h2>
            <p className="text-sm">Конфликт устройств</p>
          </div>
        </div>

        <p className="text-secondary text-sm mb-6 leading-relaxed">
          На твоём устройстве сейчас пустая история прослушиваний. Однако по сети <span className="text-primary font-medium">Holad Connect</span> найдена история с другого устройства ({pendingHistorySync.length} треков).
          <br /><br />
          Хочешь восстановить эту историю сюда, или ты специально очистил кэш и хочешь удалить историю отовсюду?
        </p>

        <div className="flex flex-col gap-3">
          <button 
            onClick={handleRestore}
            className="flex items-center justify-center gap-2 w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-colors"
          >
            <Server size={18} />
            Восстановить историю
          </button>
          <button 
            onClick={handleWipe}
            className="flex items-center justify-center gap-2 w-full py-3 bg-white/5 text-red-400 font-bold rounded-xl hover:bg-white/10 transition-colors"
          >
            <Trash2 size={18} />
            Удалить отовсюду
          </button>
        </div>
      </div>
    </div>
  );
}
