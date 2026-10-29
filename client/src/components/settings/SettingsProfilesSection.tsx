import { useState } from 'react';
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

interface Props {
  isMobile?: boolean;
}

export default function SettingsProfilesSection({ isMobile = false }: Props) {
  const { t } = useTranslation();
  const { slots, activeSlot, saveCurrentToSlot, applySlot, renameSlot, clearSlot } = useProfileStore();

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

  const handleOpenCreateOrRename = (slot: 1 | 2 | 3, type: 'create' | 'rename') => {
    const existing = slots[slot - 1];
    setModalState({
      type,
      slot,
      nameInput: existing?.name || `Профиль ${slot}`,
    });
    setActiveMenuSlot(null);
  };

  const handleConfirmModal = async () => {
    const { type, slot, nameInput } = modalState;
    if (type === 'create') {
      await saveCurrentToSlot(slot, nameInput);
      showFeedback(t('settings.profiles.saved', 'Профиль сохранён'));
    } else if (type === 'rename') {
      await renameSlot(slot, nameInput);
      showFeedback(t('settings.profiles.renamed', 'Профиль переименован'));
    } else if (type === 'overwrite') {
      const existing = slots[slot - 1];
      await saveCurrentToSlot(slot, existing?.name || `Профиль ${slot}`);
      showFeedback(t('settings.profiles.overwritten', 'Профиль перезаписан текущими настройками'));
    } else if (type === 'clear') {
      await clearSlot(slot);
      showFeedback(t('settings.profiles.cleared', 'Слот очищен'));
    }
    setModalState({ type: null, slot: 1, nameInput: '' });
  };

  const handleApply = (slot: 1 | 2 | 3) => {
    applySlot(slot);
    const name = slots[slot - 1]?.name || `Профиль ${slot}`;
    showFeedback(`${t('settings.profiles.applied', 'Применён профиль')}: ${name}`);
  };

  return (
    <SettingSection
      title={t('settings.profiles.title', 'Профили настроек')}
      icon={<SlidersHorizontal size={16} />}
      description={t('settings.profiles.subtitle', 'Быстрое сохранение и переключение 3 пользовательских сетапов звука и плеера')}
      isMobile={isMobile}
    >
      <div className="flex flex-col gap-3.5">
        {/* Helper / Info Toggle Banner */}
        <div className="bg-background/40 border border-border/80 rounded-xl overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => setShowInfo(!showInfo)}
            className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-foreground/[0.03] transition-colors"
          >
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <Info size={14} className="text-primary flex-shrink-0" />
              <span>{t('settings.profiles.info_button', 'Справка: какие настройки входят в профиль?')}</span>
            </div>
            {showInfo ? <ChevronUp size={14} className="text-secondary" /> : <ChevronDown size={14} className="text-secondary" />}
          </button>

          {showInfo && (
            <div className="px-3.5 pb-3.5 pt-1 text-xs space-y-2 border-t border-border/40 text-secondary animate-in fade-in duration-150">
              <div className="space-y-1">
                <span className="font-semibold text-primary block">
                  {t('settings.profiles.included_title', 'В профиль сохраняются и синхронизируются:')}
                </span>
                <ul className="list-disc list-inside space-y-0.5 text-secondary pl-1">
                  <li>{t('settings.profiles.inc_dsp', 'Звук и DSP: кроссфейд, тип и натяжение кривой, gapless, компрессор и нормализация')}</li>
                  <li>{t('settings.profiles.inc_stream', 'Стриминг: качество потока (raw/opus), режим и время предзагрузки треков')}</li>
                  <li>{t('settings.profiles.inc_player', 'Поведение плеера: действие при клике, режим повтора AutoDJ, продолжение в наушниках')}</li>
                </ul>
              </div>
              <div className="pt-1 border-t border-border/30 flex items-start gap-1.5 text-secondary/80">
                <VolumeX size={13} className="text-amber-500/80 flex-shrink-0 mt-0.5" />
                <span>
                  {t('settings.profiles.excluded_note', 'Локальная громкость, автозапуск с ОС, сворачивание в трей и лимиты кэша на диске остаются строго уникальными для каждого устройства.')}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Feedback message banner if triggered */}
        {feedbackMessage && (
          <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 text-primary text-xs rounded-xl font-medium animate-in fade-in duration-150">
            <CheckCircle2 size={14} />
            <span>{feedbackMessage}</span>
          </div>
        )}

        {/* 3 Slots Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-border/80 hover:border-primary/60 bg-background/20 hover:bg-card/60 transition-all text-secondary hover:text-foreground group min-h-[105px]"
                >
                  <div className="w-8 h-8 rounded-lg bg-foreground/[0.04] group-hover:bg-primary/10 group-hover:text-primary flex items-center justify-center transition-colors">
                    <Plus size={16} />
                  </div>
                  <div className="text-center">
                    <span className="text-xs font-medium block">
                      {t('settings.profiles.slot_label', 'Слот')} {slotNum}
                    </span>
                    <span className="text-[11px] text-secondary/70">
                      {t('settings.profiles.empty_prompt', 'Нажмите, чтобы сохранить')}
                    </span>
                  </div>
                </button>
              );
            }

            // Filled Slot
            return (
              <div
                key={slotNum}
                className={`relative flex flex-col justify-between p-3.5 rounded-xl border transition-all ${
                  isActive
                    ? 'bg-primary/[0.07] border-primary/50 shadow-sm shadow-primary/5'
                    : 'bg-card/70 border-border hover:border-border/90'
                }`}
              >
                {/* Header row: Badge + Menu Button */}
                <div className="flex items-center justify-between gap-1 mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded-md bg-foreground/[0.06] text-secondary">
                      {t('settings.profiles.slot_label', 'Слот')} {slotNum}
                    </span>
                    {isActive && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-primary">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        {t('settings.profiles.active', 'Активен')}
                      </span>
                    )}
                  </div>

                  {/* Options Menu Toggle */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setActiveMenuSlot(activeMenuSlot === slotNum ? null : slotNum)}
                      className="p-1 rounded-md text-secondary hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
                      title={t('common.more', 'Ещё')}
                    >
                      <MoreVertical size={14} />
                    </button>

                    {/* Dropdown popup */}
                    {activeMenuSlot === slotNum && (
                      <div className="absolute right-0 top-full mt-1 w-44 bg-card border border-border shadow-xl rounded-xl py-1 z-30 text-xs animate-in fade-in zoom-in-95 duration-150">
                        <button
                          type="button"
                          onClick={() => handleOpenCreateOrRename(slotNum, 'rename')}
                          className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-foreground/[0.06] transition-colors text-foreground"
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
                          className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-foreground/[0.06] transition-colors text-foreground"
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
                          className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-red-500/10 text-red-500 transition-colors"
                        >
                          <Trash2 size={13} />
                          <span>{t('settings.profiles.menu_clear', 'Очистить слот')}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Profile Name */}
                <div className="mb-3">
                  <span className="font-semibold text-sm text-foreground block truncate" title={slotData.name}>
                    {slotData.name}
                  </span>
                  <span className="text-[10px] text-secondary/70 block mt-0.5">
                    {slotData.data.streamingQuality ? `Качество: ${slotData.data.streamingQuality}` : ''}
                    {slotData.data.isCrossfadeEnabled ? ` • Кроссфейд ${slotData.data.crossfadeDuration}с` : ' • Без кроссфейда'}
                  </span>
                </div>

                {/* Action button */}
                <button
                  type="button"
                  onClick={() => handleApply(slotNum)}
                  className={`w-full py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                    isActive
                      ? 'bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30'
                      : 'bg-foreground/[0.05] hover:bg-primary hover:text-primary-foreground text-foreground'
                  }`}
                >
                  {isActive ? (
                    <>
                      <Check size={13} />
                      <span>{t('settings.profiles.reapply', 'Применить снова')}</span>
                    </>
                  ) : (
                    <span>{t('settings.profiles.apply', 'Применить')}</span>
                  )}
                </button>
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
                    placeholder="Например: Домашний Hi-Fi, Улица"
                    maxLength={32}
                    autoFocus
                    className="w-full bg-background border border-border focus:border-primary px-3 py-2 text-sm rounded-xl outline-hidden transition-colors"
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
                  className="px-3.5 py-1.5 text-xs font-medium rounded-xl border border-border hover:bg-foreground/[0.05] text-secondary hover:text-foreground transition-colors"
                >
                  {t('common.cancel', 'Отмена')}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmModal}
                  className={`px-4 py-1.5 text-xs font-medium rounded-xl text-white shadow-sm transition-all ${
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
