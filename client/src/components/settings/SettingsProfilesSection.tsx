import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  SlidersHorizontal, 
  Check, 
  Edit2, 
  Trash2, 
  MoreVertical, 
  Info, 
  Plus, 
  RotateCw, 
  ChevronDown, 
  ChevronUp, 
  VolumeX, 
  CheckCircle2 
} from 'lucide-react';
import SettingSection from './SettingSection';
import { useProfileStore, type ProfileSlot } from '../../store/profileStore';
import { fetchPreferences } from '../../api/preferences';

interface Props {
  isMobile?: boolean;
}

export default function SettingsProfilesSection({ isMobile = false }: Props) {
  const { t } = useTranslation();
  const { slots, activeSlot, saveCurrentToSlot, applySlot, renameSlot, clearSlot, syncWithServerProfiles } = useProfileStore();

  useEffect(() => {
    fetchPreferences().then((prefs) => {
      if (prefs?.profiles) {
        syncWithServerProfiles(prefs.profiles, prefs.updated_at);
      }
    }).catch((err) => {
      console.warn('[SettingsProfilesSection] Failed to fetch latest preferences:', err);
    });
  }, [syncWithServerProfiles]);

  const [showInfo, setShowInfo] = useState(false);
  const [activeMenuSlot, setActiveMenuSlot] = useState<number | null>(null);
  const [modalState, setModalState] = useState<{
    type: 'create' | 'rename' | 'overwrite' | 'clear' | null;
    slot: 1 | 2 | 3;
    nameInput: string;
  }>({
    type: null,
    slot: 1,
    nameInput: '',
  });

  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const showFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(null), 2500);
  };

  const getSlotDefaultName = (slot: number) => {
    return `${t('settings.profiles.default_name', 'Профиль')} ${slot}`;
  };

  const handleOpenCreateOrRename = (slot: 1 | 2 | 3, type: 'create' | 'rename') => {
    const existing = slots[slot - 1];
    setModalState({
      type,
      slot,
      nameInput: existing?.name || getSlotDefaultName(slot),
    });
    setActiveMenuSlot(null);
  };

  const handleConfirmModal = async () => {
    const { type, slot, nameInput } = modalState;
    const finalName = nameInput.trim() || getSlotDefaultName(slot);

    if (type === 'create') {
      await saveCurrentToSlot(slot, finalName);
      showFeedback(t('settings.profiles.saved', 'Профиль сохранён'));
    } else if (type === 'rename') {
      await renameSlot(slot, finalName);
      showFeedback(t('settings.profiles.renamed', 'Профиль переименован'));
    } else if (type === 'overwrite') {
      const existing = slots[slot - 1];
      await saveCurrentToSlot(slot, existing?.name || getSlotDefaultName(slot));
      showFeedback(t('settings.profiles.overwritten', 'Профиль перезаписан текущими настройками'));
    } else if (type === 'clear') {
      await clearSlot(slot);
      showFeedback(t('settings.profiles.cleared', 'Слот очищен'));
    }
    setModalState({ type: null, slot: 1, nameInput: '' });
  };

  const handleApply = (slot: 1 | 2 | 3) => {
    applySlot(slot);
    const name = slots[slot - 1]?.name || getSlotDefaultName(slot);
    showFeedback(`${t('settings.profiles.applied', 'Применён профиль')}: ${name}`);
  };

  return (
    <SettingSection
      title={t('settings.profiles.title', 'Профили настроек')}
      icon={<SlidersHorizontal size={16} />}
      isMobile={isMobile}
    >
      <div className="flex flex-col gap-3">
        {/* Helper / Info Toggle Banner */}
        <div className="bg-foreground/[0.02] border border-border rounded-xl overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => setShowInfo(!showInfo)}
            className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-foreground/[0.03] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <Info size={13} className="text-primary shrink-0" />
              <span>{t('settings.profiles.info_button', 'Справка: какие настройки входят в профиль?')}</span>
            </div>
            {showInfo ? <ChevronUp size={13} className="text-secondary shrink-0" /> : <ChevronDown size={13} className="text-secondary shrink-0" />}
          </button>

          {showInfo && (
            <div className="px-3 pb-3 pt-1 text-xs space-y-2 border-t border-border text-secondary animate-in fade-in duration-150">
              <div className="space-y-1">
                <span className="font-semibold text-primary block text-[11px]">
                  {t('settings.profiles.included_title', 'В профиль сохраняются и синхронизируются:')}
                </span>
                <ul className="list-disc list-inside space-y-0.5 text-secondary pl-1 text-[11px]">
                  <li>{t('settings.profiles.inc_dsp', 'Звук и DSP: кроссфейд, тип и натяжение кривой, gapless, компрессор и нормализация')}</li>
                  <li>{t('settings.profiles.inc_stream', 'Стриминг: качество потока (raw/opus), режим и время предзагрузки треков')}</li>
                  <li>{t('settings.profiles.inc_player', 'Поведение плеера: действие при клике, режим повтора AutoDJ, продолжение в наушниках')}</li>
                </ul>
              </div>
              <div className="pt-1 border-t border-border flex items-start gap-1.5 text-secondary/80 text-[11px]">
                <VolumeX size={12} className="text-amber-500/80 shrink-0 mt-0.5" />
                <span>
                  {t('settings.profiles.excluded_note', 'Локальная громкость, автозапуск с ОС, сворачивание в трей и лимиты кэша на диске остаются строго уникальными для каждого устройства.')}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Feedback message banner if triggered */}
        {feedbackMessage && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 text-primary text-xs rounded-xl font-medium animate-in fade-in duration-150">
            <CheckCircle2 size={13} />
            <span>{feedbackMessage}</span>
          </div>
        )}

        {/* 3 Slots Grid: Compact & Balanced with Equal Padding */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {([1, 2, 3] as const).map((slotNum) => {
            const slotData: ProfileSlot | null = slots[slotNum - 1];
            const isActive = activeSlot === slotNum;

            if (!slotData) {
              // Empty Slot
              return (
                <button
                  key={slotNum}
                  type="button"
                  onClick={() => handleOpenCreateOrRename(slotNum, 'create')}
                  className="min-h-[78px] h-auto flex flex-col items-center justify-center p-3 rounded-xl border border-dashed border-border hover:border-primary/40 bg-foreground/[0.015] hover:bg-foreground/[0.04] transition-all text-secondary hover:text-foreground group cursor-pointer"
                >
                  <div className="flex items-center gap-1.5 leading-none">
                    <Plus size={13} className="text-secondary/70 group-hover:text-primary transition-colors" />
                    <span className="text-xs font-semibold text-foreground/80 group-hover:text-foreground">
                      {t('settings.profiles.slot_label', 'Слот')} {slotNum}
                    </span>
                  </div>
                  <span className="text-[11px] text-secondary/60 leading-none mt-1.5">
                    {t('settings.profiles.empty_prompt', 'Нажмите, чтобы сохранить')}
                  </span>
                </button>
              );
            }

            // Filled Slot
            return (
              <div
                key={slotNum}
                className={`relative min-h-[78px] h-auto flex flex-col justify-between p-3 rounded-xl border transition-all gap-2 ${
                  isActive
                    ? 'bg-primary/[0.06] border-primary/30 shadow-xs'
                    : 'bg-card/60 border-border hover:bg-foreground/[0.02]'
                }`}
              >
                {/* Header row: Badge + Menu Button + Quick Apply */}
                <div className="flex items-center justify-between gap-1 leading-none">
                  <span
                    className={`text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded shrink-0 ${
                      isActive
                        ? 'bg-primary/20 text-primary'
                        : 'bg-foreground/[0.06] text-secondary'
                    }`}
                  >
                    {t('settings.profiles.slot_label', 'Слот')} {slotNum}
                  </span>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleApply(slotNum)}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer ${
                        isActive
                          ? 'bg-primary/15 text-primary hover:bg-primary/25 border border-primary/20'
                          : 'bg-foreground/[0.06] hover:bg-primary hover:text-primary-foreground text-foreground'
                      }`}
                      title={isActive ? t('settings.profiles.reapply', 'Применить снова') : t('settings.profiles.apply', 'Применить')}
                    >
                      {isActive ? (
                        <>
                          <Check size={11} />
                          <span className="text-[10px]">{t('settings.profiles.reapply_short', 'Снова')}</span>
                        </>
                      ) : (
                        <span>{t('settings.profiles.apply', 'Применить')}</span>
                      )}
                    </button>

                    {/* Options Menu Toggle */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setActiveMenuSlot(activeMenuSlot === slotNum ? null : slotNum)}
                        className="p-1 rounded-md text-secondary hover:text-foreground hover:bg-foreground/[0.06] transition-colors cursor-pointer"
                        title={t('common.more', 'Ещё')}
                      >
                        <MoreVertical size={13} />
                      </button>

                      {/* Dropdown popup */}
                      {activeMenuSlot === slotNum && (
                        <div className="absolute right-0 top-full mt-1 w-44 bg-card border border-border shadow-xl rounded-xl py-1 z-30 text-xs animate-in fade-in zoom-in-95 duration-150">
                          <button
                            type="button"
                            onClick={() => handleOpenCreateOrRename(slotNum, 'rename')}
                            className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-foreground/[0.06] transition-colors text-foreground cursor-pointer"
                          >
                            <Edit2 size={13} className="text-secondary" />
                            <span>{t('settings.profiles.menu_rename', 'Переименовать')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setModalState({ type: 'overwrite', slot: slotNum, nameInput: slotData.name });
                              setActiveMenuSlot(null);
                            }}
                            className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-foreground/[0.06] transition-colors text-foreground cursor-pointer"
                          >
                            <RotateCw size={13} className="text-secondary" />
                            <span>{t('settings.profiles.menu_overwrite', 'Перезаписать')}</span>
                          </button>
                          <div className="border-t border-border my-1" />
                          <button
                            type="button"
                            onClick={() => {
                              setModalState({ type: 'clear', slot: slotNum, nameInput: slotData.name });
                              setActiveMenuSlot(null);
                            }}
                            className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-red-500/10 text-red-500 transition-colors cursor-pointer"
                          >
                            <Trash2 size={13} />
                            <span>{t('settings.profiles.menu_clear', 'Очистить слот')}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Profile Name & Summary */}
                <div className="min-w-0">
                  <span className="font-semibold text-xs text-foreground block truncate leading-tight" title={slotData.name}>
                    {slotData.name}
                  </span>
                  <span className="text-[10px] text-secondary/80 block leading-relaxed mt-1 break-words">
                    {slotData.data.streamingQuality ? `${t('settings.profiles.quality_label', 'Качество')}: ${slotData.data.streamingQuality}` : ''}
                    {slotData.data.isCrossfadeEnabled
                      ? ` • ${t('settings.profiles.crossfade_label', 'Кроссфейд')} ${slotData.data.crossfadeDuration}s`
                      : ` • ${t('settings.profiles.no_crossfade', 'Без кроссфейда')}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Dialog for Create / Rename / Overwrite / Clear */}
        {modalState.type && (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
            onClick={() => setModalState({ type: null, slot: 1, nameInput: '' })}
          >
            <div
              className="bg-card w-full max-w-sm rounded-2xl shadow-2xl border border-border p-5 flex flex-col gap-4 animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div>
                <h3 className="font-bold text-sm text-foreground">
                  {modalState.type === 'create' && `${t('settings.profiles.save_slot_title', 'Сохранить в слот')} ${modalState.slot}`}
                  {modalState.type === 'rename' && t('settings.profiles.rename_title', 'Переименовать профиль')}
                  {modalState.type === 'overwrite' && t('settings.profiles.overwrite_title', 'Перезаписать профиль?')}
                  {modalState.type === 'clear' && t('settings.profiles.clear_title', 'Очистить слот профиля?')}
                </h3>
                <p className="text-xs text-secondary mt-1">
                  {modalState.type === 'create' && t('settings.profiles.create_desc', 'Текущие параметры звука, стриминга и плеера будут сохранены.')}
                  {modalState.type === 'rename' && t('settings.profiles.rename_desc', 'Введите новое название для этого профиля.')}
                  {modalState.type === 'overwrite' && t('settings.profiles.overwrite_desc', 'Текущие настройки приложения заменят настройки в данном слоте.')}
                  {modalState.type === 'clear' && t('settings.profiles.clear_desc', 'Слот будет освобождён. Это действие нельзя отменить.')}
                </p>
              </div>

              {(modalState.type === 'create' || modalState.type === 'rename') && (
                <div>
                  <label className="text-[11px] font-medium text-secondary block mb-1">
                    {t('settings.profiles.name_input_label', 'Название профиля')}
                  </label>
                  <input
                    type="text"
                    value={modalState.nameInput}
                    onChange={(e) => setModalState((prev) => ({ ...prev, nameInput: e.target.value }))}
                    placeholder={t('settings.profiles.name_placeholder', 'Например: Домашний Hi-Fi, Улица')}
                    maxLength={32}
                    autoFocus
                    className="w-full bg-background border border-border focus:border-primary px-3 py-2 text-sm rounded-xl outline-hidden transition-colors text-foreground"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmModal();
                    }}
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setModalState({ type: null, slot: 1, nameInput: '' })}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-xl border border-border hover:bg-foreground/[0.05] text-secondary hover:text-foreground transition-colors cursor-pointer"
                >
                  {t('common.cancel', 'Отмена')}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmModal}
                  className={`px-4 py-1.5 text-xs font-medium rounded-xl text-white shadow-sm transition-all cursor-pointer ${
                    modalState.type === 'clear'
                      ? 'bg-red-500 hover:bg-red-600'
                      : 'bg-primary hover:bg-primary/90'
                  }`}
                >
                  {modalState.type === 'clear'
                    ? t('common.clear', 'Очистить')
                    : modalState.type === 'overwrite'
                    ? t('common.overwrite', 'Перезаписать')
                    : t('common.save', 'Сохранить')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SettingSection>
  );
}
